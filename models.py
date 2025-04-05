# Models file for database integration if needed in the future
# This file is intentionally minimal as we're using in-memory storage for now
# For a production environment, we would define SQLAlchemy models here

class AnswerKey:
    """Model representing an answer key"""
    def __init__(self, id, answers, grid_coords):
        self.id = id
        self.answers = answers
        self.grid_coords = grid_coords
        self.created_at = None

class StudentSheet:
    """Model representing a student's answer sheet"""
    def __init__(self, id, student_name, answers, score, answer_key_id):
        self.id = id
        self.student_name = student_name
        self.answers = answers
        self.score = score
        self.answer_key_id = answer_key_id
        self.created_at = None
