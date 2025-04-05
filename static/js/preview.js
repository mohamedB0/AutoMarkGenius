// Preview script for displaying and visualizing MCQ sheets

document.addEventListener('DOMContentLoaded', function() {
    // Chart initialization function for results page
    function initCharts() {
        const scoresChartEl = document.getElementById('scoresChart');
        if (!scoresChartEl) return;
        
        // Get scores data from the data attribute
        const resultsData = JSON.parse(scoresChartEl.getAttribute('data-results'));
        
        if (resultsData && resultsData.length > 0) {
            // Extract data for charts
            const labels = resultsData.map(r => r.student_name || 'Unknown');
            const scores = resultsData.map(r => r.percentage);
            const colors = scores.map(score => 
                score >= 80 ? 'rgba(46, 204, 113, 0.7)' : 
                score >= 60 ? 'rgba(243, 156, 18, 0.7)' : 
                'rgba(231, 76, 60, 0.7)'
            );
            
            // Create scores chart
            new Chart(scoresChartEl, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Score (%)',
                        data: scores,
                        backgroundColor: colors,
                        borderColor: colors.map(c => c.replace('0.7', '1')),
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            title: {
                                display: true,
                                text: 'Score (%)'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Students'
                            }
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: 'Student Scores',
                            font: {
                                size: 18
                            }
                        },
                        legend: {
                            display: false
                        }
                    }
                }
            });
            
            // Create distribution chart if there are enough results
            const distributionChartEl = document.getElementById('distributionChart');
            if (distributionChartEl && resultsData.length > 1) {
                // Group scores into ranges
                const ranges = [
                    {min: 0, max: 50, label: '0-50%', color: 'rgba(231, 76, 60, 0.7)'},
                    {min: 50, max: 60, label: '50-60%', color: 'rgba(230, 126, 34, 0.7)'},
                    {min: 60, max: 70, label: '60-70%', color: 'rgba(241, 196, 15, 0.7)'},
                    {min: 70, max: 80, label: '70-80%', color: 'rgba(243, 156, 18, 0.7)'},
                    {min: 80, max: 90, label: '80-90%', color: 'rgba(39, 174, 96, 0.7)'},
                    {min: 90, max: 100, label: '90-100%', color: 'rgba(46, 204, 113, 0.7)'}
                ];
                
                const distribution = ranges.map(range => {
                    return {
                        label: range.label,
                        count: scores.filter(score => score >= range.min && score <= range.max).length,
                        color: range.color
                    };
                });
                
                new Chart(distributionChartEl, {
                    type: 'pie',
                    data: {
                        labels: distribution.map(d => d.label),
                        datasets: [{
                            data: distribution.map(d => d.count),
                            backgroundColor: distribution.map(d => d.color),
                            borderColor: distribution.map(d => d.color.replace('0.7', '1')),
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Score Distribution',
                                font: {
                                    size: 18
                                }
                            },
                            legend: {
                                position: 'right'
                            }
                        }
                    }
                });
            }
            
            // Create detection modes chart
            const modeChartEl = document.getElementById('modeChart');
            if (modeChartEl) {
                // Count detection modes
                const realTimeModeCount = resultsData.filter(r => r.mode === 'realtime').length;
                const manualModeCount = resultsData.length - realTimeModeCount;
                
                new Chart(modeChartEl, {
                    type: 'doughnut',
                    data: {
                        labels: ['Real-time Mode', 'Manual Mode'],
                        datasets: [{
                            data: [realTimeModeCount, manualModeCount],
                            backgroundColor: ['rgba(23, 162, 184, 0.7)', 'rgba(108, 117, 125, 0.7)'],
                            borderColor: ['rgba(23, 162, 184, 1)', 'rgba(108, 117, 125, 1)'],
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Detection Modes',
                                font: {
                                    size: 18
                                }
                            },
                            legend: {
                                position: 'bottom'
                            }
                        }
                    }
                });
            }
        }
    }
    
    // Initialize charts
    initCharts();
    
    // Handle expand/collapse all details
    const expandAllBtn = document.getElementById('expandAllBtn');
    const collapseAllBtn = document.getElementById('collapseAllBtn');
    
    if (expandAllBtn && collapseAllBtn) {
        expandAllBtn.addEventListener('click', function() {
            document.querySelectorAll('.answer-details').forEach(detail => {
                detail.style.display = 'block';
            });
            document.querySelectorAll('.view-details-btn').forEach(btn => {
                btn.textContent = 'Hide Details';
            });
        });
        
        collapseAllBtn.addEventListener('click', function() {
            document.querySelectorAll('.answer-details').forEach(detail => {
                detail.style.display = 'none';
            });
            document.querySelectorAll('.view-details-btn').forEach(btn => {
                btn.textContent = 'View Details';
            });
        });
    }
    
    // Handle view details buttons in results page
    document.querySelectorAll('.view-details-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const details = this.nextElementSibling;
            const isVisible = details.style.display !== 'none';
            details.style.display = isVisible ? 'none' : 'block';
            this.textContent = isVisible ? 'View Details' : 'Hide Details';
        });
    });
    
    // Table sorting functionality
    document.querySelectorAll('th[data-sort]').forEach(header => {
        header.addEventListener('click', function() {
            const table = this.closest('table');
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            const sortKey = this.dataset.sort;
            const isAsc = this.classList.contains('sort-asc');
            
            // Update sort direction indicator
            table.querySelectorAll('th').forEach(th => {
                th.classList.remove('sort-asc', 'sort-desc');
            });
            
            this.classList.add(isAsc ? 'sort-desc' : 'sort-asc');
            
            // Sort the rows
            rows.sort((a, b) => {
                let aVal = a.querySelector(`td[data-${sortKey}]`).dataset[sortKey];
                let bVal = b.querySelector(`td[data-${sortKey}]`).dataset[sortKey];
                
                // Convert to numbers if possible
                if (!isNaN(aVal) && !isNaN(bVal)) {
                    aVal = parseFloat(aVal);
                    bVal = parseFloat(bVal);
                }
                
                if (aVal < bVal) return isAsc ? -1 : 1;
                if (aVal > bVal) return isAsc ? 1 : -1;
                return 0;
            });
            
            // Reorder the rows
            rows.forEach(row => tbody.appendChild(row));
        });
    });
});
