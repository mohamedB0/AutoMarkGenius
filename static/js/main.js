// Main JavaScript for the MCQ Auto-Corrector Application

document.addEventListener('DOMContentLoaded', function() {
    // Keep track of the current session ID
    let currentSessionId = null;
    
    // Step management
    const steps = document.querySelectorAll('.step');
    
    function updateSteps(activeStep) {
        steps.forEach((step, index) => {
            if (index < activeStep) {
                step.classList.add('completed');
                step.classList.remove('active');
            } else if (index === activeStep) {
                step.classList.add('active');
                step.classList.remove('completed');
            } else {
                step.classList.remove('active', 'completed');
            }
        });
    }
    
    // Initialize steps
    updateSteps(0);
    
    // Handle file uploads with drag and drop
    const uploadAreas = document.querySelectorAll('.upload-area');
    const fileInputs = document.querySelectorAll('input[type="file"]');
    
    uploadAreas.forEach((area, index) => {
        const fileInput = fileInputs[index];
        
        // Click on upload area should trigger file input
        area.addEventListener('click', function() {
            fileInput.click();
        });
        
        // Highlight when dragging files over
        area.addEventListener('dragover', function(e) {
            e.preventDefault();
            area.classList.add('active');
        });
        
        area.addEventListener('dragleave', function() {
            area.classList.remove('active');
        });
        
        // Handle file drop
        area.addEventListener('drop', function(e) {
            e.preventDefault();
            area.classList.remove('active');
            
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                // Trigger change event to update file name display
                const changeEvent = new Event('change');
                fileInput.dispatchEvent(changeEvent);
            }
        });
        
        // Display selected file name
        fileInput.addEventListener('change', function() {
            const fileNameElement = area.querySelector('.file-name');
            if (fileNameElement && this.files.length) {
                fileNameElement.textContent = this.files[0].name;
                area.classList.add('has-file');
                
                // If there's a preview container, show image preview
                const previewContainer = area.nextElementSibling;
                if (previewContainer && previewContainer.classList.contains('preview-container')) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const img = previewContainer.querySelector('img') || document.createElement('img');
                        img.src = e.target.result;
                        img.classList.add('image-preview');
                        if (!img.parentNode) {
                            previewContainer.appendChild(img);
                        }
                        previewContainer.style.display = 'block';
                    };
                    reader.readAsDataURL(this.files[0]);
                }
            }
        });
    });
    
    // Handle answer key upload form submission
    const answerKeyForm = document.getElementById('answerKeyForm');
    if (answerKeyForm) {
        answerKeyForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const submitBtn = answerKeyForm.querySelector('button[type="submit"]');
            const loadingSpinner = document.createElement('span');
            loadingSpinner.className = 'spinner-border spinner-border-sm';
            loadingSpinner.setAttribute('role', 'status');
            loadingSpinner.setAttribute('aria-hidden', 'true');
            
            // Disable button and show loading spinner
            submitBtn.disabled = true;
            submitBtn.prepend(loadingSpinner);
            submitBtn.querySelector('.btn-text').textContent = ' Processing...';
            
            fetch('/upload-answer-key', {
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
                // Store session ID
                currentSessionId = data.session_id;
                
                // Update UI to show success
                showAlert('Answer key processed successfully!', 'success');
                
                // Update steps
                updateSteps(1);
                
                // Enable student sheet section
                const studentSection = document.getElementById('studentSheetSection');
                if (studentSection) {
                    studentSection.classList.remove('disabled');
                    studentSection.querySelector('input[name="sessionId"]').value = currentSessionId;
                }
                
                // Scroll to student section
                studentSection.scrollIntoView({ behavior: 'smooth' });
            })
            .catch(error => {
                console.error('Error:', error);
                showAlert('Error processing answer key: ' + error.message, 'danger');
            })
            .finally(() => {
                // Reset button
                submitBtn.disabled = false;
                submitBtn.removeChild(loadingSpinner);
                submitBtn.querySelector('.btn-text').textContent = 'Upload Answer Key';
            });
        });
    }
    
    // Handle student sheet upload form submission
    const studentSheetForm = document.getElementById('studentSheetForm');
    if (studentSheetForm) {
        studentSheetForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            if (!currentSessionId) {
                showAlert('Please upload an answer key first.', 'warning');
                return;
            }
            
            const formData = new FormData(this);
            formData.append('sessionId', currentSessionId);
            
            const submitBtn = studentSheetForm.querySelector('button[type="submit"]');
            const loadingSpinner = document.createElement('span');
            loadingSpinner.className = 'spinner-border spinner-border-sm';
            loadingSpinner.setAttribute('role', 'status');
            loadingSpinner.setAttribute('aria-hidden', 'true');
            
            // Disable button and show loading spinner
            submitBtn.disabled = true;
            submitBtn.prepend(loadingSpinner);
            submitBtn.querySelector('.btn-text').textContent = ' Processing...';
            
            fetch('/upload-student-sheet', {
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
                
                // Enable view all results button
                const viewResultsBtn = document.getElementById('viewResultsBtn');
                if (viewResultsBtn) {
                    viewResultsBtn.href = `/results/${currentSessionId}`;
                    viewResultsBtn.classList.remove('disabled');
                }
                
                // Reset form
                studentSheetForm.reset();
                const previewContainer = document.querySelector('#studentSheetSection .preview-container');
                if (previewContainer) {
                    previewContainer.style.display = 'none';
                }
                
                const fileNameElement = document.querySelector('#studentSheetSection .file-name');
                if (fileNameElement) {
                    fileNameElement.textContent = 'No file selected';
                }
                
                document.querySelector('#studentSheetSection .upload-area').classList.remove('has-file');
            })
            .catch(error => {
                console.error('Error:', error);
                showAlert('Error processing student sheet: ' + error.message, 'danger');
            })
            .finally(() => {
                // Reset button
                submitBtn.disabled = false;
                submitBtn.removeChild(loadingSpinner);
                submitBtn.querySelector('.btn-text').textContent = 'Process Student Sheet';
            });
        });
    }
    
    // Function to display results
    function displayResult(data) {
        const resultsContainer = document.getElementById('resultsContainer');
        if (!resultsContainer) return;
        
        // Show the results section
        resultsContainer.style.display = 'block';
        
        // Create result card
        const percentage = data.percentage.toFixed(2);
        let scoreClass = 'score-low';
        if (percentage >= 80) {
            scoreClass = 'score-high';
        } else if (percentage >= 60) {
            scoreClass = 'score-medium';
        }
        
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        resultItem.innerHTML = `
            <div class="result-header">
                <div class="result-name">${data.student_name || 'Student'}</div>
                <div class="result-score ${scoreClass}">${data.score}/${data.total} (${percentage}%)</div>
            </div>
            <div class="progress">
                <div class="progress-bar progress-bar-${percentage >= 80 ? 'success' : percentage >= 60 ? 'warning' : 'danger'}"
                     role="progressbar" style="width: ${percentage}%"
                     aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100"></div>
            </div>
            <button class="btn btn-sm btn-outline-primary mt-2 view-details-btn">View Details</button>
            <div class="answer-details mt-3" style="display: none;">
                <table class="answer-table">
                    <thead>
                        <tr>
                            <th>Question</th>
                            <th>Correct Answer</th>
                            <th>Student Answer</th>
                            <th>Result</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.details.map(detail => `
                            <tr>
                                <td>${detail.question}</td>
                                <td>${detail.correct_answer}</td>
                                <td class="${detail.is_correct ? 'correct-answer' : 'incorrect-answer'}">${detail.student_answer}</td>
                                <td>${detail.is_correct ? '✓' : '✗'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        // Add to results container
        resultsContainer.appendChild(resultItem);
        
        // Handle view details button
        const viewDetailsBtn = resultItem.querySelector('.view-details-btn');
        const answerDetails = resultItem.querySelector('.answer-details');
        
        viewDetailsBtn.addEventListener('click', function() {
            const isVisible = answerDetails.style.display !== 'none';
            answerDetails.style.display = isVisible ? 'none' : 'block';
            viewDetailsBtn.textContent = isVisible ? 'View Details' : 'Hide Details';
        });
        
        // Scroll to results
        resultsContainer.scrollIntoView({ behavior: 'smooth' });
    }
    
    // Function to show alerts
    function showAlert(message, type) {
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
    
    // Clear results button
    const clearResultsBtn = document.getElementById('clearResultsBtn');
    if (clearResultsBtn) {
        clearResultsBtn.addEventListener('click', function() {
            const resultsContainer = document.getElementById('resultsContainer');
            if (resultsContainer) {
                // Clear all results
                while (resultsContainer.firstChild) {
                    resultsContainer.removeChild(resultsContainer.firstChild);
                }
                resultsContainer.style.display = 'none';
            }
        });
    }
    
    // Handle start over button
    const startOverBtn = document.getElementById('startOverBtn');
    if (startOverBtn) {
        startOverBtn.addEventListener('click', function() {
            if (currentSessionId) {
                // Confirm before starting over
                if (confirm('This will clear all your current work. Are you sure?')) {
                    window.location.href = `/clear-session/${currentSessionId}`;
                }
            } else {
                window.location.href = '/';
            }
        });
    }
});
