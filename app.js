class GPXForm {
    constructor() {
        this.fileInput = document.getElementById('fileInput');
        this.uploadArea = document.getElementById('uploadArea');
        
        this.selectedFile = null;
        this.processor = new GPXProcessor();
        this.instagram = new GPXInstagram();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // File input change
        this.fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        // Drag and drop events
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });

        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });
    }

    handleFiles(files) {
        const validFiles = Array.from(files).filter(file => {
            return file.name.toLowerCase().endsWith('.gpx');
        });

        if (validFiles.length === 0) {
            this.showError('Please select a valid GPX file.');
            return;
        }

        if (validFiles.length > 1) {
            this.showError('Please select only one GPX file at a time.');
            return;
        }

        this.selectedFile = validFiles[0];
        this.analyzeGPXFile(this.selectedFile).then(analysis => {
            this.instagram.displayAnalysisResults(analysis);
        });
    }

    async analyzeGPXFile(file) {
        console.log('Analyzing GPX file...');
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const gpxText = e.target.result;
                    const parser = new DOMParser();
                    const gpxDoc = parser.parseFromString(gpxText, 'text/xml');
                    
                    const analysis = this.processor.parseGPXData(gpxDoc);
                    resolve(analysis);
                } catch (error) {
                    reject(new Error('Failed to parse GPX file: ' + error.message));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }
}

class GPXProcessor {
    constructor() {
        this.points = [];
    }
    
    parseGPXData(gpxDoc) {
        // Find all track points
        const trackPoints = gpxDoc.querySelectorAll('trkpt');
        const points = [];
        
        trackPoints.forEach(point => {
            const lat = parseFloat(point.getAttribute('lat'));
            const lon = parseFloat(point.getAttribute('lon'));
            const ele = point.querySelector('ele');
            const time = point.querySelector('time');
            
            if (!isNaN(lat) && !isNaN(lon)) {
                points.push({
                    lat: lat,
                    lon: lon,
                    ele: ele ? parseFloat(ele.textContent) : null,
                    time: time ? new Date(time.textContent) : null
                });
            }
        });

        if (points.length < 2) {
            throw new Error('Not enough track points to analyze');
        }

        // Filter out slow-moving points (slower than 0.5 km/h)
        const filteredPoints = this.filterSlowMovingPoints(points);

        return this.calculateMetrics(filteredPoints);
    }

    calculateMetrics(points) {
        // Calculate total distance
        let totalDistance = 0;
        for (let i = 1; i < points.length; i++) {
            const distance = this.calculateDistance(
                points[i-1].lat, points[i-1].lon,
                points[i].lat, points[i].lon
            );
            totalDistance += distance;
        }

        // Calculate duration
        const startTime = points[0].time;
        const endTime = points[points.length - 1].time;
        const duration = startTime && endTime ? (endTime - startTime) / 1000 : null; // in seconds

        // Calculate average pace (min/km)
        const averagePace = duration && totalDistance > 0 ? 
            (duration / 60) / (totalDistance / 1000) : null;

        // Calculate elevation gain
        let elevationGain = 0;
        for (let i = 1; i < points.length; i++) {
            if (points[i-1].ele !== null && points[i].ele !== null) {
                const diff = points[i].ele - points[i-1].ele;
                if (diff > 0) {
                    elevationGain += diff;
                }
            }
        }

        return {
            totalDistance: totalDistance,
            duration: duration,
            averagePace: averagePace,
            elevationGain: elevationGain,
            trackPoints: points
        };
    }

    filterSlowMovingPoints(points) {
        if (points.length < 2) return points;
        
        const MIN_SPEED_KMH = 1.5; // Minimum speed in km/h
        const filteredPoints = []; // Always keep the first point
        
        for (let i = 0; i < points.length; i++) {
            const currentPoint = points[i];
            const nextPoint = points[i + 1];
            
            // Skip if no timestamp data
            if (!currentPoint || !nextPoint) {
                filteredPoints.push(currentPoint);
                continue;
            }
            
            // Calculate time difference in seconds
            const timeDiff = (nextPoint.time - currentPoint.time) / 1000;
            
            // Skip if time difference is too small (less than 1 second)
            if (timeDiff < 1) {
                continue;
            }
            
            // Calculate distance between points
            const distance = this.calculateDistance(
                currentPoint.lat, currentPoint.lon,
                nextPoint.lat, nextPoint.lon
            );
            
            // Calculate speed in km/h
            const speedKmh = (distance / 1000) / (timeDiff / 3600);
            
            // Keep the point if speed is above threshold or if it's the last point
            if (speedKmh >= MIN_SPEED_KMH || i === points.length - 1) {
                filteredPoints.push(currentPoint);
            }
        }
        
        return filteredPoints;
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        // Haversine formula for calculating distance between two points
        const R = 6371000; // Earth's radius in meters
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // Distance in meters
    }

    toRadians(degrees) {
        return degrees * (Math.PI/180);
    }
}

class GPXInstagram {
    constructor() {
        this.analysisResults = document.getElementById('analysisResults');
        this.exportStoryHDBtn = document.getElementById('exportStoryHDBtn');
        this.exportPreview = document.getElementById('exportPreview');
        this.exportCanvas = document.getElementById('exportCanvas');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.customTitle = document.getElementById('customTitle');
        this.shoeInfo = document.getElementById('shoeInfo');
        
        this.currentAnalysis = null;
        this.currentStoryCanvas = null;
        this.setupEventListeners();
    }

    displayAnalysisResults(analysis) {
        this.currentAnalysis = analysis;
        this.analysisResults.classList.add('show');
        this.generateInstagramStoryPreview(this.currentAnalysis);
    }

    setupEventListeners() {
        this.exportStoryHDBtn.addEventListener('click', () => {
            if (this.currentAnalysis) {
                this.generateInstagramStoryPreview(this.currentAnalysis);
            }
        });
        
        this.downloadBtn.addEventListener('click', () => {
            this.downloadCurrentStory();
        });
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    formatDuration(seconds) {
        if (!seconds) return '--';
        return this.formatTime(seconds);
    }

    formatDistance(meters) {
        if (meters < 1000) {
            return `${Math.round(meters)}m`;
        } else {
            return `${(meters / 1000).toFixed(2)}km`;
        }
    }

    formatPace(pace) {
        if (!pace) return '--';
        return this.formatTime(pace * 60) + '/km';
    }

    formatElevation(meters) {
        if (!meters) return '--';
        return `${Math.round(meters)}m`;
    }

    calculateBounds(points) {
        let minLat = points[0].lat;
        let maxLat = points[0].lat;
        let minLon = points[0].lon;
        let maxLon = points[0].lon;

        for (const point of points) {
            minLat = Math.min(minLat, point.lat);
            maxLat = Math.max(maxLat, point.lat);
            minLon = Math.min(minLon, point.lon);
            maxLon = Math.max(maxLon, point.lon);
        }

        return { minLat, maxLat, minLon, maxLon };
    }

    getActivityDate(trackPoints) {
        if (!trackPoints || trackPoints.length === 0) return null;
        
        // Find the first point with a valid timestamp
        for (const point of trackPoints) {
            if (point.time) {
                const date = new Date(point.time);
                if (!isNaN(date.getTime())) {
                    // Format as "Month Day, Year" (e.g., "January 15, 2024")
                    return date.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                }
            }
        }
        
        return null;
    }

    generateInstagramStoryPreview(analysis) {
        // Create high-resolution canvas for the story
        const hdCanvas = document.createElement('canvas');
        hdCanvas.width = 1080;
        hdCanvas.height = 1920;
        const hdCtx = hdCanvas.getContext('2d');
        
        // Generate the full-resolution story
        this.drawInstagramStory(hdCtx, analysis, hdCanvas.width, hdCanvas.height);
        
        // Store the HD canvas for download
        this.currentStoryCanvas = hdCanvas;
        
        // Create preview on the display canvas (scaled down)
        const previewCtx = this.exportCanvas.getContext('2d');
        const scale = Math.min(this.exportCanvas.width / hdCanvas.width, this.exportCanvas.height / hdCanvas.height);
        
        // Clear preview canvas
        previewCtx.clearRect(0, 0, this.exportCanvas.width, this.exportCanvas.height);
        
        // Draw scaled version
        const scaledWidth = hdCanvas.width * scale;
        const scaledHeight = hdCanvas.height * scale;
        const offsetX = (this.exportCanvas.width - scaledWidth) / 2;
        const offsetY = (this.exportCanvas.height - scaledHeight) / 2;
        
        previewCtx.drawImage(hdCanvas, offsetX, offsetY, scaledWidth, scaledHeight);
        
        // Show preview and download button
        this.exportPreview.classList.add('show');
        this.downloadBtn.style.display = 'flex';
    }

    downloadCurrentStory() {
        if (this.currentStoryCanvas) {
            this.downloadCanvas(this.currentStoryCanvas, 'instagram-story-1080x1920.png');
        }
    }

    drawInstagramStory(ctx, analysis, width, height) {
        // Create gradient background
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(1, '#764ba2');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        // Add custom title with shadow effect
        const customTitle = this.customTitle.value.trim() || 'Activity Summary';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = 'white';
        ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(customTitle, width / 2, 200);
        
        // Add date with shadow effect
        const activityDate = this.getActivityDate(analysis.trackPoints);
        if (activityDate) {
            ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillText(activityDate, width / 2, 280);
        }
        
        // Add shoe information if provided
        const shoeInfo = this.shoeInfo.value.trim();
        if (shoeInfo) {
            ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillText(`${shoeInfo}`, width / 2, 345);
        }
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw track visualization
        this.drawTrackForStory(ctx, 90, 490, 900, 500, analysis.trackPoints);
        
        // Add metrics as cards in 2x2 grid
        const metricsY = 1210;
        const cardWidth = 450;
        const cardHeight = 300;
        const cardSpacing = 50;
        
        const metrics = [
            { label: 'Duration', value: this.formatDuration(analysis.duration), icon: '⏱️' },
            { label: 'Distance', value: this.formatDistance(analysis.totalDistance), icon: '📏' },
            { label: 'Pace', value: this.formatPace(analysis.averagePace), icon: '🏃' },
            { label: 'Elevation', value: this.formatElevation(analysis.elevationGain), icon: '↑↓' }
        ];
        
        metrics.forEach((metric, index) => {
            const cardX = 65 + (index % 2) * (cardWidth + cardSpacing);
            const cardY = metricsY + Math.floor(index / 2) * (cardHeight + cardSpacing);
            
            // Draw card with glass-morphism effect
            ctx.save();
            
            // Create rounded rectangle
            ctx.beginPath();
            ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 30);
            ctx.clip();
            
            // Semi-transparent background with gradient
            const cardGradient = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardHeight);
            cardGradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
            cardGradient.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
            ctx.fillStyle = cardGradient;
            ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
            
            // Add subtle border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.restore();
            
            // Add shadow effect
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 20;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 5;
            
            // Draw icon
            ctx.font = '80px Arial';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'white';
            ctx.fillText(metric.icon, cardX + cardWidth/2, cardY + 110);
            
            // Draw label
            ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillText(metric.label, cardX + cardWidth/2, cardY + 180);
            
            // Draw value
            ctx.font = 'bold 60px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle = 'white';
            ctx.fillText(metric.value, cardX + cardWidth/2, cardY + 250);
            
            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        });
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    drawTrackForStory(ctx, x, y, width, height, trackPoints) {
        if (!trackPoints || trackPoints.length < 2) return;
        
        const bounds = this.calculateBounds(trackPoints);
        const padding = 40;
        const scaleX = (width - 2 * padding) / (bounds.maxLon - bounds.minLon);
        const scaleY = (height - 2 * padding) / (bounds.maxLat - bounds.minLat);
        const scale = Math.min(scaleX, scaleY);
        
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        const trackWidth = (bounds.maxLon - bounds.minLon) * scale;
        const trackHeight = (bounds.maxLat - bounds.minLat) * scale;
        
        // Draw track with shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        for (let i = 0; i < trackPoints.length; i++) {
            const point = trackPoints[i];
            const px = centerX - trackWidth / 2 + (point.lon - bounds.minLon) * scale;
            const py = centerY - trackHeight / 2 + (bounds.maxLat - point.lat) * scale;
            
            if (i === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    downloadCanvas(canvas, filename) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }
}

// Initialize the uploader when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new GPXForm();
});