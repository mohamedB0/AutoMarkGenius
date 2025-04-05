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
    const ipWebcamUrlInput = document.getElementById('ipWebcamUrl');
    const useIpWebcamCheckbox = document.getElementById('useIpWebcam');
    
    let stream = null;
    let mediaRecorder = null;
    let imageCapture = null;
    let isUsingIpWebcam = false;
    
    // Start webcam (device or IP webcam)
    async function startWebcam() {
        try {
            // Check if using IP webcam
            isUsingIpWebcam = useIpWebcamCheckbox && useIpWebcamCheckbox.checked;
            
            if (isUsingIpWebcam) {
                // Using IP webcam
                const ipWebcamUrl = ipWebcamUrlInput.value.trim();
                
                if (!ipWebcamUrl) {
                    showAlert('Please enter a valid IP webcam URL', 'warning');
                    return;
                }
                
                // Set video source to IP webcam stream
                const videoUrl = ipWebcamUrl.endsWith('/video') ? ipWebcamUrl : `${ipWebcamUrl}/video`;
                webcamVideo.src = videoUrl;
                
                // Enable UI for IP webcam
                webcamVideo.onloadeddata = () => {
                    captureBtn.disabled = false;
                    stopWebcamBtn.disabled = false;
                    startWebcamBtn.disabled = true;
                    
                    // Show webcam container
                    webcamContainer.style.display = 'block';
                    
                    // Scroll to webcam
                    webcamContainer.scrollIntoView({ behavior: 'smooth' });
                };
                
                // Handle load error
                webcamVideo.onerror = () => {
                    showAlert('Error connecting to IP webcam. Please check the URL and make sure the IP webcam app is running.', 'danger');
                    stopWebcam();
                };
            } else {
                // Using device webcam
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
            }
        } catch (error) {
            console.error('Error accessing webcam:', error);
            showAlert('Error accessing webcam: ' + error.message, 'danger');
        }
    }
    
    // Stop webcam
    function stopWebcam() {
        if (isUsingIpWebcam) {
            // IP webcam cleanup
            webcamVideo.src = '';
            webcamVideo.srcObject = null;
        } else if (stream) {
            // Device webcam cleanup
            stream.getTracks().forEach(track => track.stop());
            webcamVideo.srcObject = null;
            stream = null;
            imageCapture = null;
        }
        
        captureBtn.disabled = true;
        stopWebcamBtn.disabled = true;
        startWebcamBtn.disabled = false;
        
        // Hide webcam container
        webcamContainer.style.display = 'none';
    }
    
    // Capture image from webcam (device or IP)
    async function captureImage() {
        try {
            captureBtn.disabled = true;
            captureBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Capturing...';
            
            let blob;
            
            if (isUsingIpWebcam) {
                // Capture from IP webcam by drawing video to canvas
                const canvas = document.getElementById('webcamCanvas');
                canvas.width = webcamVideo.videoWidth;
                canvas.height = webcamVideo.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(webcamVideo, 0, 0, canvas.width, canvas.height);
                
                // Convert canvas to blob
                blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
            } else if (imageCapture) {
                // Capture from device webcam
                blob = await imageCapture.takePhoto();
            } else {
                throw new Error('No capture method available');
            }
            
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
                if (typeof displayResult === 'function') {
                    displayResult(data);
                }
                
                // Update steps
                if (typeof updateSteps === 'function') {
                    updateSteps(2);
                }
                
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
    
    // Function to show alerts (if not defined in main.js)
    function showAlert(message, type) {
        if (typeof window.showAlert === 'function') {
            window.showAlert(message, type);
            return;
        }
        
        const alertsContainer = document.getElementById('alertsContainer');
        if (!alertsContainer) return;
        
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.setAttribute('role', 'alert');
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        alertsContainer.appendChild(alert);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.classList.remove('show');
                setTimeout(() => {
                    if (alert.parentNode) {
                        alertsContainer.removeChild(alert);
                    }
                }, 150);
            }
        }, 5000);
    }
    
    // Toggle IP webcam URL input visibility
    if (useIpWebcamCheckbox) {
        useIpWebcamCheckbox.addEventListener('change', function() {
            const ipWebcamUrlGroup = document.getElementById('ipWebcamUrlGroup');
            if (ipWebcamUrlGroup) {
                ipWebcamUrlGroup.style.display = this.checked ? 'block' : 'none';
            }
        });
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
