import cv2
import numpy as np
import logging
import os
from sklearn.cluster import KMeans
from ml_model import BubbleDetectorModel

# Initialize the ML model
bubble_detector = BubbleDetectorModel()

logger = logging.getLogger(__name__)

def preprocess_image(image_path):
    """
    Preprocess the image for better feature extraction
    
    Args:
        image_path (str): Path to the image file
        
    Returns:
        numpy.ndarray: Preprocessed image
    """
    try:
        # Read the image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not read image at {image_path}")
        
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Apply adaptive thresholding to get binary image
        thresh = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY_INV, 11, 2
        )
        
        return thresh
    
    except Exception as e:
        logger.error(f"Error preprocessing image: {str(e)}")
        raise

def detect_grid(img):
    """
    Detect the grid structure in the MCQ sheet
    
    Args:
        img (numpy.ndarray): Preprocessed image
        
    Returns:
        tuple: Coordinates of the grid (x, y, width, height)
    """
    try:
        # Find contours
        contours, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            logger.warning("No contours found in the image")
            return None
        
        # Find rectangular contours
        rectangles = []
        for contour in contours:
            peri = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
            
            # Check if it's a rectangle (4 vertices) and has a reasonable area
            if len(approx) == 4:
                x, y, w, h = cv2.boundingRect(approx)
                area = w * h
                
                # Filter out very small rectangles
                if area > (img.shape[0] * img.shape[1]) / 100:  # Minimum area threshold
                    rectangles.append((x, y, w, h))
        
        if not rectangles:
            logger.warning("No suitable rectangles found")
            return None
        
        # For now, we'll take the largest rectangle as the MCQ grid
        # In a more sophisticated solution, you would need more criteria
        largest_rectangle = max(rectangles, key=lambda r: r[2] * r[3])
        
        return largest_rectangle
    
    except Exception as e:
        logger.error(f"Error detecting grid: {str(e)}")
        raise

def extract_answers(img, grid_coords):
    """
    Extract the marked answers from the MCQ sheet
    
    Args:
        img (numpy.ndarray): Preprocessed image
        grid_coords (tuple): Coordinates of the grid (x, y, width, height)
        
    Returns:
        list: List of marked answers
    """
    try:
        x, y, w, h = grid_coords
        
        # Extract the grid region
        grid_region = img[y:y+h, x:x+w]
        
        # Find contours in the grid region
        contours, _ = cv2.findContours(grid_region, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            logger.warning("No contours found in the grid region")
            return []
        
        # Filter contours to find circles (bubbles)
        bubbles = []
        for contour in contours:
            # Approximate the contour
            peri = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
            
            # Get bounding rectangle
            rect_x, rect_y, rect_w, rect_h = cv2.boundingRect(contour)
            
            # Check if it's reasonably circular and not too small or too large
            aspect_ratio = float(rect_w) / rect_h if rect_h != 0 else 0
            area = cv2.contourArea(contour)
            
            # Criteria for potential bubbles
            if 0.8 <= aspect_ratio <= 1.2 and grid_region.size / 1000 > area > 30:
                # Add the center point and area of the bubble
                center_x = rect_x + rect_w // 2
                center_y = rect_y + rect_h // 2
                bubbles.append((center_x, center_y, area, rect_w, rect_h))
        
        if not bubbles:
            logger.warning("No suitable bubbles found")
            return []
        
        # Use K-means to cluster bubbles into rows
        if len(bubbles) > 1:
            # Extract y-coordinates for clustering
            bubble_centers_y = np.array([b[1] for b in bubbles]).reshape(-1, 1)
            
            # Estimate number of rows
            estimated_rows = min(len(bubbles) // 2, 20)  # Assume at least 2 bubbles per row, max 20 rows
            kmeans = KMeans(n_clusters=estimated_rows, random_state=0).fit(bubble_centers_y)
            
            # Group bubbles by row
            rows = {}
            for i, (bubble, row_label) in enumerate(zip(bubbles, kmeans.labels_)):
                if row_label not in rows:
                    rows[row_label] = []
                rows[row_label].append(bubble)
            
            # Sort rows by y-coordinate
            sorted_rows = sorted(rows.items(), key=lambda x: np.mean([b[1] for b in x[1]]))
            
            # For each row, find the marked bubble (if any)
            answers = []
            for row_label, row_bubbles in sorted_rows:
                # Sort bubbles in this row by x-coordinate
                sorted_row_bubbles = sorted(row_bubbles, key=lambda b: b[0])
                
                # Use ML model to detect filled bubbles
                best_bubble_idx = None
                highest_confidence = 0
                
                # Check each bubble with ML model
                for i, bubble in enumerate(sorted_row_bubbles):
                    center_x, center_y, area, width, height = bubble
                    
                    # Extract the bubble region for ML classification
                    bubble_region = grid_region[center_y-height//2:center_y+height//2, 
                                                center_x-width//2:center_x+width//2]
                    
                    if bubble_region.size == 0:
                        continue
                    
                    # Use ML model to predict if bubble is filled
                    prediction, confidence = bubble_detector.predict(bubble_region)
                    
                    # If the bubble is predicted as filled and has higher confidence
                    if prediction == 1 and confidence > highest_confidence:
                        highest_confidence = confidence
                        best_bubble_idx = i
                        
                # Fallback to traditional detection if ML doesn't find a filled bubble
                if best_bubble_idx is None:
                    highest_area = 0
                    for i, bubble in enumerate(sorted_row_bubbles):
                        center_x, center_y, area, width, height = bubble
                        if area > highest_area:
                            highest_area = area
                            best_bubble_idx = i
                
                # If a bubble seems to be filled, record its position
                if best_bubble_idx is not None:
                    # Convert to answer choice ('A', 'B', 'C', 'D', 'E')
                    choice_idx = best_bubble_idx
                    choice = chr(65 + choice_idx) if choice_idx < 26 else f"Choice {choice_idx+1}"
                    answers.append(choice)
            
            return answers
        else:
            logger.warning("Not enough bubbles found for clustering")
            return []
    
    except Exception as e:
        logger.error(f"Error extracting answers: {str(e)}")
        raise

def collect_training_data(img, grid_coords, answers):
    """
    Collect training data from a processed sheet
    
    Args:
        img (numpy.ndarray): Preprocessed image
        grid_coords (tuple): Coordinates of the grid (x, y, width, height)
        answers (list): List of marked answers
        
    Returns:
        None (data is used to train the model)
    """
    try:
        if not os.path.exists('static/models'):
            os.makedirs('static/models')
            
        x, y, w, h = grid_coords
        
        # Extract the grid region
        grid_region = img[y:y+h, x:x+w]
        
        # Find contours in the grid region
        contours, _ = cv2.findContours(grid_region, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            logger.warning("No contours found in the grid region for training")
            return
        
        # Find all bubbles
        bubbles = []
        for contour in contours:
            # Get bounding rectangle
            rect_x, rect_y, rect_w, rect_h = cv2.boundingRect(contour)
            
            # Check if it's reasonably circular and not too small or too large
            aspect_ratio = float(rect_w) / rect_h if rect_h != 0 else 0
            area = cv2.contourArea(contour)
            
            # Criteria for potential bubbles
            if 0.8 <= aspect_ratio <= 1.2 and grid_region.size / 1000 > area > 30:
                # Add bubble info
                center_x = rect_x + rect_w // 2
                center_y = rect_y + rect_h // 2
                bubble_region = grid_region[
                    max(0, center_y-rect_h//2):min(grid_region.shape[0], center_y+rect_h//2), 
                    max(0, center_x-rect_w//2):min(grid_region.shape[1], center_x+rect_w//2)
                ]
                
                if bubble_region.size > 0:
                    bubbles.append({
                        'center_x': center_x,
                        'center_y': center_y,
                        'region': bubble_region,
                        'width': rect_w,
                        'height': rect_h,
                        'area': area
                    })
        
        if not bubbles:
            logger.warning("No suitable bubbles found for training")
            return
        
        # Cluster bubbles into rows using K-means
        if len(bubbles) > 1:
            # Extract y-coordinates for clustering
            bubble_centers_y = np.array([b['center_y'] for b in bubbles]).reshape(-1, 1)
            
            # Estimate number of rows
            estimated_rows = min(len(bubbles) // 2, 20)
            kmeans = KMeans(n_clusters=estimated_rows, random_state=0).fit(bubble_centers_y)
            
            # Group bubbles by row
            rows = {}
            for i, (bubble, row_label) in enumerate(zip(bubbles, kmeans.labels_)):
                if row_label not in rows:
                    rows[row_label] = []
                rows[row_label].append(bubble)
            
            # Sort rows by y-coordinate
            sorted_rows = sorted(rows.items(), key=lambda x: np.mean([b['center_y'] for b in x[1]]))
            
            # For known answers, build training data
            marked_bubbles = []
            empty_bubbles = []
            
            for row_idx, (row_label, row_bubbles) in enumerate(sorted_rows):
                if row_idx >= len(answers):
                    break
                    
                # Get chosen answer for this row
                answer = answers[row_idx]
                choice_idx = ord(answer) - 65 if 'A' <= answer <= 'Z' else int(answer.split()[-1]) - 1
                
                # Sort bubbles in this row by x-coordinate
                sorted_row_bubbles = sorted(row_bubbles, key=lambda b: b['center_x'])
                
                if choice_idx < len(sorted_row_bubbles):
                    # Add marked bubble to training set
                    marked_bubbles.append(sorted_row_bubbles[choice_idx]['region'])
                    
                    # Add other bubbles as empty examples
                    for i, bubble in enumerate(sorted_row_bubbles):
                        if i != choice_idx:
                            empty_bubbles.append(bubble['region'])
            
            # Train the model if we have enough data
            if len(marked_bubbles) >= 5 and len(empty_bubbles) >= 5:
                X, y = bubble_detector.collect_training_data(marked_bubbles, empty_bubbles)
                bubble_detector.train(X, y)
                logger.info(f"Model trained with {len(marked_bubbles)} marked and {len(empty_bubbles)} empty bubbles")
    
    except Exception as e:
        logger.error(f"Error collecting training data: {str(e)}")


def compare_answers(correct_answers, student_answers):
    """
    Compare the student's answers with the correct answers
    
    Args:
        correct_answers (list): List of correct answers
        student_answers (list): List of student's answers
        
    Returns:
        tuple: (score, details)
    """
    score = 0
    details = []
    
    # Make sure we have the same number of answers to compare
    min_length = min(len(correct_answers), len(student_answers))
    
    for i in range(min_length):
        is_correct = correct_answers[i] == student_answers[i]
        if is_correct:
            score += 1
        
        details.append({
            'question': i + 1,
            'correct_answer': correct_answers[i],
            'student_answer': student_answers[i],
            'is_correct': is_correct
        })
    
    # If the student sheet has fewer answers than the answer key
    for i in range(min_length, len(correct_answers)):
        details.append({
            'question': i + 1,
            'correct_answer': correct_answers[i],
            'student_answer': 'No answer',
            'is_correct': False
        })
    
    return score, details
