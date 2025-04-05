// Webcam functionality for real-time MCQ detection

document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const webcamContainer = document.getElementById('webcamContainer');
    const webcamVideo = document.getElementById('webcamVideo');
    const captureBtn = document.getElementById('captureBtn');
    const webcamCanvas = document.getElementById('webcamCanvas');
    const webcamPreview = document.getElementById('webcamPreview');
    const startWebcamBtn = document.getElementById('startWebcamBtn');
    const stopWebcamBtn = document.getElementById('stopWebcamBtn');
    
    let stream = null;
    let mediaRecorder = null;
    let imageCapture = null;
    
    // Start webcam
    async function startWebcam() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' },
                audio: false 
            });
            
            webcamVideo.srcObject = stream;
            
            // Enable capture button once the video is loaded
            webcamVideo.onloadedmetadata = () => {
                captureBtn.disabled = false;
                stopWebcamBtn.disabled = false;
                startWebcamBtn.disabled = true;
                
                // Setup image capture
                const track = stream.getVideoTracks()[0];
                imageCapture = new ImageCapture(track);
                
                // Show webcam container
                webcamContainer.style.display = 'block';
                
                // Scroll to webcam
                webcamContainer.scrollIntoView({ behavior: 'smooth' });
            };
        } catch (error) {
            console.error('Error accessing webcam:', error);
            showAlert('Error accessing webcam: ' + error.message, 'danger');
        }
    }
    
    // Stop webcam
    function stopWebcam() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            webcamVideo.srcObject = null;
            stream = null;
            imageCapture = null;
            
            captureBtn.disabled = true;
            stopWebcamBtn.disabled = true;
            startWebcamBtn.disabled = false;
            
            // Hide webcam container
            webcamContainer.style.display = 'none';
        }
    }
    
    // Capture image from webcam
    async function captureImage() {
        if (!imageCapture) return;
        
        try {
            captureBtn.disabled = true;
            captureBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Capturing...';
            
            // Capture image
            const blob = await imageCapture.takePhoto();
            
            // Display captured image
            const imgUrl = URL.createObjectURL(blob);
            webcamPreview.src = imgUrl;
            webcamPreview.style.display = 'block';
            
            // Create form data for upload
            const formData = new FormData();
            formData.append('webcamImage', blob, 'webcam-capture.jpg');
            formData.append('sessionId', document.querySelector('input[name="sessionId"]').value);
            formData.append('studentName', document.getElementById('studentName').value || 'Unknown');
            
            // Process captured image
            fetch('/process-webcam-image', {
                method: 'POST',
                body: formData
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Server error: ' + response.status);
                }
                return response.json();
            })
            .then(data => {
                // Display results
                displayResult(data);
                
                // Update steps
                updateSteps(2);
                
                // Show success message
                showAlert('Image processed successfully!', 'success');
                
                // Enable view all results button
                const viewResultsBtn = document.getElementById('viewResultsBtn');
                if (viewResultsBtn) {
                    viewResultsBtn.href = `/results/${document.querySelector('input[name="sessionId"]').value}`;
                    viewResultsBtn.classList.remove('disabled');
                }
            })
            .catch(error => {
                console.error('Error processing image:', error);
                showAlert('Error processing image: ' + error.message, 'danger');
            })
            .finally(() => {
                // Reset button
                captureBtn.disabled = false;
                captureBtn.innerHTML = '<i class="fas fa-camera"></i> Capture Image';
            });
            
        } catch (error) {
            console.error('Error capturing image:', error);
            showAlert('Error capturing image: ' + error.message, 'danger');
            
            // Reset button
            captureBtn.disabled = false;
            captureBtn.innerHTML = '<i class="fas fa-camera"></i> Capture Image';
        }
    }
    
    // Event listeners
    if (startWebcamBtn) {
        startWebcamBtn.addEventListener('click', startWebcam);
    }
    
    if (stopWebcamBtn) {
        stopWebcamBtn.addEventListener('click', stopWebcam);
    }
    
    if (captureBtn) {
        captureBtn.addEventListener('click', captureImage);
    }
    
    // Check if browser supports ImageCapture API
    if (typeof ImageCapture === 'undefined') {
        if (startWebcamBtn) {
            startWebcamBtn.disabled = true;
            startWebcamBtn.title = 'Your browser does not support the ImageCapture API';
        }
        
        const webcamModeRadio = document.getElementById('modeWebcam');
        if (webcamModeRadio) {
            webcamModeRadio.disabled = true;
            webcamModeRadio.parentElement.title = 'Your browser does not support the ImageCapture API';
        }
        
        showAlert('Your browser does not support webcam capture. Please use Chrome or Edge for this feature.', 'warning');
    }
    
    // Handle mode change
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    if (modeRadios.length) {
        modeRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                // Show/hide webcam controls based on selected mode
                if (this.value === 'webcam') {
                    document.getElementById('webcamControls').style.display = 'block';
                    document.getElementById('fileUploadSection').style.display = 'none';
                } else {
                    document.getElementById('webcamControls').style.display = 'none';
                    document.getElementById('fileUploadSection').style.display = 'block';
                    
                    // Stop webcam if it's running
                    stopWebcam();
                }
            });
        });
    }
});
