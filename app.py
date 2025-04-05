import os
import logging
import uuid
import csv
import io
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, send_file
from werkzeug.utils import secure_filename
from werkzeug.middleware.proxy_fix import ProxyFix
import numpy as np
from flask_cors import CORS
from mcq_processor import preprocess_image, detect_grid, extract_answers, compare_answers, collect_training_data

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Create the app
app = Flask(__name__)
# Enable CORS for IP webcam integration
CORS(app)
app.secret_key = os.environ.get("SESSION_SECRET", "dev_secret_key")
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# Configure upload folder
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf'}

# In-memory storage for demo purposes
# In a production environment, use a proper database
sessions = {}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    # Pass the current datetime to the template for the copyright year
    return render_template('index.html', now=datetime.now())


@app.route('/upload-answer-key', methods=['POST'])
def upload_answer_key():
    if 'answerKey' not in request.files:
        flash('No file part', 'danger')
        return redirect(request.url)
    
    file = request.files['answerKey']
    if file.filename == '':
        flash('No selected file', 'danger')
        return redirect(request.url)
    
    if file and allowed_file(file.filename):
        # Create a new session
        session_id = str(uuid.uuid4())
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}_{filename}")
        file.save(filepath)
        
        try:
            # Process the answer key
            img = preprocess_image(filepath)
            grid_coords = detect_grid(img)
            if grid_coords is None:
                flash('Could not detect MCQ grid in the answer key', 'danger')
                os.remove(filepath)
                return redirect(url_for('index'))
            
            answers = extract_answers(img, grid_coords)
            if not answers:
                flash('Could not extract answers from the answer key', 'danger')
                os.remove(filepath)
                return redirect(url_for('index'))
            
            # Store session data
            sessions[session_id] = {
                'answer_key': answers,
                'grid_coords': grid_coords,
                'student_sheets': [],
                'results': []
            }
            
            # Train ML model with the answer key data
            collect_training_data(img, grid_coords, answers)
            logger.info(f"Collected training data from answer key with {len(answers)} answers")
            
            flash('Answer key uploaded successfully', 'success')
            return jsonify({'session_id': session_id, 'message': 'Answer key processed successfully'})
        
        except Exception as e:
            logger.error(f"Error processing answer key: {str(e)}")
            flash(f"Error processing answer key: {str(e)}", 'danger')
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({'error': str(e)}), 500
    
    flash('Invalid file type. Please upload a PNG, JPG, JPEG or PDF file.', 'danger')
    return redirect(url_for('index'))


@app.route('/upload-student-sheet', methods=['POST'])
def upload_student_sheet():
    session_id = request.form.get('sessionId')
    if not session_id or session_id not in sessions:
        flash('Invalid session. Please start over by uploading an answer key first.', 'danger')
        return redirect(url_for('index'))
    
    mode = request.form.get('mode', 'manual')  # Get the mode: 'manual', 'realtime', or 'webcam'
    
    if 'studentSheet' not in request.files:
        flash('No file part', 'danger')
        return redirect(request.url)
    
    file = request.files['studentSheet']
    if file.filename == '':
        flash('No selected file', 'danger')
        return redirect(request.url)
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}_student_{filename}")
        file.save(filepath)
        
        try:
            # Process the student sheet
            img = preprocess_image(filepath)
            grid_coords = sessions[session_id]['grid_coords']
            student_answers = extract_answers(img, grid_coords)
            
            if not student_answers:
                flash('Could not extract answers from the student sheet', 'danger')
                os.remove(filepath)
                return redirect(url_for('index'))
            
            # Compare with answer key
            correct_answers = sessions[session_id]['answer_key']
            score, details = compare_answers(correct_answers, student_answers)
            
            # If score is high enough (at least 70%), use for training data
            if score / len(correct_answers) >= 0.7:
                collect_training_data(img, grid_coords, student_answers)
                logger.info(f"Collected training data from student sheet with {len(student_answers)} answers")
            
            # Store result
            student_name = request.form.get('studentName', 'Unknown')
            result = {
                'student_name': student_name,
                'filename': filename,
                'score': score,
                'total': len(correct_answers),
                'percentage': (score / len(correct_answers)) * 100 if len(correct_answers) > 0 else 0,
                'details': details,
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'mode': mode
            }
            
            sessions[session_id]['student_sheets'].append(filepath)
            sessions[session_id]['results'].append(result)
            
            # If in real-time mode, automatically save to CSV
            if mode == 'realtime' or mode == 'webcam':
                # Create a timestamp for the filename
                timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
                csv_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}_realtime_{timestamp}.csv")
                
                # Create CSV file
                with open(csv_path, 'w', newline='') as csvfile:
                    writer = csv.writer(csvfile)
                    # Write header
                    writer.writerow(['Student Name', 'Score', 'Total', 'Percentage', 'Timestamp', 'Detection Mode'])
                    # Write all results in the session
                    for r in sessions[session_id]['results']:
                        writer.writerow([
                            r['student_name'],
                            r['score'],
                            r['total'],
                            f"{r['percentage']:.2f}%",
                            r['timestamp'],
                            r.get('mode', 'manual')
                        ])
                
                # Add CSV path to session data
                if 'csv_files' not in sessions[session_id]:
                    sessions[session_id]['csv_files'] = []
                sessions[session_id]['csv_files'].append(csv_path)
            
            # Return result
            return jsonify({
                'student_name': student_name,
                'score': score,
                'total': len(correct_answers),
                'percentage': (score / len(correct_answers)) * 100 if len(correct_answers) > 0 else 0,
                'details': details,
                'mode': mode,
                'auto_saved': mode == 'realtime' or mode == 'webcam'
            })
        
        except Exception as e:
            logger.error(f"Error processing student sheet: {str(e)}")
            flash(f"Error processing student sheet: {str(e)}", 'danger')
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({'error': str(e)}), 500
    
    flash('Invalid file type. Please upload a PNG, JPG, JPEG or PDF file.', 'danger')
    return redirect(url_for('index'))


@app.route('/process-webcam-image', methods=['POST'])
def process_webcam_image():
    """Process an image captured from the webcam"""
    session_id = request.form.get('sessionId')
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session. Please start over by uploading an answer key first.'}), 400
    
    if 'webcamImage' not in request.files:
        return jsonify({'error': 'No image found in request'}), 400
    
    file = request.files['webcamImage']
    if not file:
        return jsonify({'error': 'Empty file received'}), 400
    
    try:
        # Save the captured image
        filename = f"webcam_capture_{uuid.uuid4()}.jpg"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}_{filename}")
        file.save(filepath)
        
        # Process the captured image
        img = preprocess_image(filepath)
        grid_coords = sessions[session_id]['grid_coords']
        student_answers = extract_answers(img, grid_coords)
        
        if not student_answers:
            os.remove(filepath)
            return jsonify({'error': 'Could not extract answers from the image'}), 400
        
        # Compare with answer key
        correct_answers = sessions[session_id]['answer_key']
        score, details = compare_answers(correct_answers, student_answers)
        
        # If score is high enough (at least 70%), use for training data
        if score / len(correct_answers) >= 0.7:
            collect_training_data(img, grid_coords, student_answers)
            logger.info(f"Collected training data from webcam image with {len(student_answers)} answers")
        
        # Store result
        student_name = request.form.get('studentName', 'Unknown')
        result = {
            'student_name': student_name,
            'filename': filename,
            'score': score,
            'total': len(correct_answers),
            'percentage': (score / len(correct_answers)) * 100 if len(correct_answers) > 0 else 0,
            'details': details,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'mode': 'webcam'
        }
        
        sessions[session_id]['student_sheets'].append(filepath)
        sessions[session_id]['results'].append(result)
        
        # Automatically save to CSV (real-time mode)
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        csv_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}_webcam_{timestamp}.csv")
        
        # Create CSV file
        with open(csv_path, 'w', newline='') as csvfile:
            writer = csv.writer(csvfile)
            # Write header
            writer.writerow(['Student Name', 'Score', 'Total', 'Percentage', 'Timestamp', 'Detection Mode'])
            # Write all results in the session
            for r in sessions[session_id]['results']:
                writer.writerow([
                    r['student_name'],
                    r['score'],
                    r['total'],
                    f"{r['percentage']:.2f}%",
                    r['timestamp'],
                    r.get('mode', 'manual')
                ])
        
        # Add CSV path to session data
        if 'csv_files' not in sessions[session_id]:
            sessions[session_id]['csv_files'] = []
        sessions[session_id]['csv_files'].append(csv_path)
        
        # Return result
        return jsonify({
            'student_name': student_name,
            'score': score,
            'total': len(correct_answers),
            'percentage': (score / len(correct_answers)) * 100 if len(correct_answers) > 0 else 0,
            'details': details,
            'mode': 'webcam',
            'auto_saved': True
        })
    
    except Exception as e:
        logger.error(f"Error processing webcam image: {str(e)}")
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'error': str(e)}), 500


@app.route('/results/<session_id>')
def results(session_id):
    if session_id not in sessions:
        flash('Session not found. Please start over.', 'danger')
        return redirect(url_for('index'))
    
    return render_template('results.html', 
                          session_id=session_id, 
                          results=sessions[session_id]['results'],
                          num_questions=len(sessions[session_id]['answer_key']),
                          now=datetime.now())


@app.route('/export-csv/<session_id>')
def export_csv(session_id):
    if session_id not in sessions:
        flash('Session not found.', 'danger')
        return redirect(url_for('index'))
    
    results = sessions[session_id]['results']
    if not results:
        flash('No results to export.', 'warning')
        return redirect(url_for('results', session_id=session_id))
    
    # Create in-memory CSV file
    output = io.StringIO()
    csv_writer = csv.writer(output)
    
    # Write header
    csv_writer.writerow(['Student Name', 'Score', 'Total', 'Percentage', 'Timestamp', 'Detection Mode'])
    
    # Write data
    for result in results:
        csv_writer.writerow([
            result['student_name'],
            result['score'],
            result['total'],
            f"{result['percentage']:.2f}%",
            result['timestamp'],
            result.get('mode', 'manual')
        ])
    
    # Prepare response
    output.seek(0)
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8')),
        as_attachment=True,
        download_name=f'mcq_results_{timestamp}.csv',
        mimetype='text/csv'
    )


@app.route('/clear-session/<session_id>')
def clear_session(session_id):
    if session_id in sessions:
        # Clean up uploaded files
        for filepath in sessions[session_id].get('student_sheets', []):
            if os.path.exists(filepath):
                os.remove(filepath)
        
        # Remove session data
        del sessions[session_id]
    
    flash('Session cleared successfully.', 'success')
    return redirect(url_for('index'))


@app.errorhandler(413)
def too_large(e):
    flash('File too large. Maximum size is 16MB.', 'danger')
    return redirect(url_for('index'))


@app.errorhandler(500)
def server_error(e):
    flash('An error occurred while processing your request.', 'danger')
    return redirect(url_for('index'))


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
