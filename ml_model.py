"""
Machine Learning model for MCQ sheet detection
This module provides ML capabilities to improve the accuracy of bubble detection.
"""

import os
import pickle
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

# Path to save the trained model
MODEL_PATH = os.path.join('static', 'models')
MODEL_FILE = os.path.join(MODEL_PATH, 'bubble_detector.pkl')
SCALER_FILE = os.path.join(MODEL_PATH, 'feature_scaler.pkl')

# Ensure the model directory exists
if not os.path.exists(MODEL_PATH):
    os.makedirs(MODEL_PATH)

class BubbleDetectorModel:
    """
    Machine Learning model for detecting filled bubbles in MCQ sheets.
    Uses features extracted from image processing to improve detection accuracy.
    """
    
    def __init__(self):
        """Initialize the model"""
        self.model = None
        self.scaler = None
        self.is_trained = False
        self._load_model()
    
    def _load_model(self):
        """Load a trained model if available"""
        try:
            if os.path.exists(MODEL_FILE) and os.path.exists(SCALER_FILE):
                with open(MODEL_FILE, 'rb') as model_file:
                    self.model = pickle.load(model_file)
                with open(SCALER_FILE, 'rb') as scaler_file:
                    self.scaler = pickle.load(scaler_file)
                self.is_trained = True
                print("Model loaded successfully")
            else:
                print("No pre-trained model found. Creating a new model.")
                self.model = RandomForestClassifier(n_estimators=100, random_state=42)
                self.scaler = StandardScaler()
        except Exception as e:
            print(f"Error loading model: {e}")
            self.model = RandomForestClassifier(n_estimators=100, random_state=42)
            self.scaler = StandardScaler()
    
    def extract_features(self, bubble_image):
        """
        Extract features from a bubble image
        
        Args:
            bubble_image (numpy.ndarray): Grayscale image of a potential bubble
            
        Returns:
            numpy.ndarray: Feature vector
        """
        # Image statistics as features
        mean_intensity = np.mean(bubble_image)
        std_intensity = np.std(bubble_image)
        min_intensity = np.min(bubble_image)
        max_intensity = np.max(bubble_image)
        
        # Histogram features (5 bins)
        hist, _ = np.histogram(bubble_image, bins=5, range=(0, 256))
        hist = hist / hist.sum()  # Normalize
        
        # Gradient features
        gradient_x = np.abs(np.gradient(bubble_image)[0]).mean()
        gradient_y = np.abs(np.gradient(bubble_image)[1]).mean()
        
        # Combine all features
        features = np.array([
            mean_intensity, std_intensity, min_intensity, max_intensity,
            *hist, gradient_x, gradient_y
        ])
        
        return features.reshape(1, -1)
    
    def train(self, X, y):
        """
        Train the model with bubble features
        
        Args:
            X (numpy.ndarray): Feature matrix where each row is a feature vector
            y (numpy.ndarray): Target labels (1 for filled, 0 for empty)
            
        Returns:
            float: Model accuracy score
        """
        if X.shape[0] < 10:
            print("Not enough samples for training. Need at least 10 samples.")
            return 0.0
        
        # Split data into training and validation sets
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=42)
        
        # Scale features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_val_scaled = self.scaler.transform(X_val)
        
        # Train the model
        self.model.fit(X_train_scaled, y_train)
        
        # Evaluate
        y_pred = self.model.predict(X_val_scaled)
        accuracy = accuracy_score(y_val, y_pred)
        print(f"Model trained with accuracy: {accuracy:.4f}")
        print(classification_report(y_val, y_pred))
        
        # Save the model
        with open(MODEL_FILE, 'wb') as model_file:
            pickle.dump(self.model, model_file)
        with open(SCALER_FILE, 'wb') as scaler_file:
            pickle.dump(self.scaler, scaler_file)
        
        self.is_trained = True
        return accuracy
    
    def predict(self, bubble_image):
        """
        Predict if a bubble is filled
        
        Args:
            bubble_image (numpy.ndarray): Grayscale image of a potential bubble
            
        Returns:
            tuple: (prediction (1=filled, 0=empty), confidence)
        """
        if not self.is_trained:
            # Fallback to traditional threshold-based detection
            mean_intensity = np.mean(bubble_image)
            is_filled = 1 if mean_intensity < 180 else 0
            confidence = abs(mean_intensity - 180) / 180
            return is_filled, min(confidence, 1.0)
        
        # Extract features
        features = self.extract_features(bubble_image)
        
        # Scale features
        features_scaled = self.scaler.transform(features)
        
        # Predict
        prediction = self.model.predict(features_scaled)[0]
        confidence = np.max(self.model.predict_proba(features_scaled)[0])
        
        return prediction, confidence
    
    def collect_training_data(self, marked_bubbles, empty_bubbles):
        """
        Collect training data from a set of manually classified bubbles
        
        Args:
            marked_bubbles (list): List of bubble images that are filled
            empty_bubbles (list): List of bubble images that are empty
            
        Returns:
            tuple: (X, y) feature matrix and target labels
        """
        # Extract features from all bubbles
        X = []
        y = []
        
        # Process marked (filled) bubbles
        for bubble in marked_bubbles:
            features = self.extract_features(bubble)[0]
            X.append(features)
            y.append(1)  # 1 for filled
        
        # Process empty bubbles
        for bubble in empty_bubbles:
            features = self.extract_features(bubble)[0]
            X.append(features)
            y.append(0)  # 0 for empty
        
        return np.array(X), np.array(y)


# Main function for independent testing
if __name__ == "__main__":
    # Example usage
    model = BubbleDetectorModel()
    print(f"Model trained: {model.is_trained}")
    
    # Sample training with random data
    if not model.is_trained:
        # Generate synthetic data for testing
        n_samples = 100
        # Simulate filled bubble features (darker, less variance)
        filled_features = np.random.normal(loc=50, scale=10, size=(n_samples, 11))
        # Simulate empty bubble features (brighter, more variance)
        empty_features = np.random.normal(loc=200, scale=20, size=(n_samples, 11))
        
        X = np.vstack([filled_features, empty_features])
        y = np.array([1] * n_samples + [0] * n_samples)
        
        model.train(X, y)