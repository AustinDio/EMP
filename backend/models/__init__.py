
from datetime import datetime

from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

from extensions import db


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    department = db.Column(db.String(120))
    contact = db.Column(db.String(30))
    status = db.Column(db.String(20), default="Active", nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Course(db.Model):
    __tablename__ = "courses"

    id = db.Column(db.Integer, primary_key=True)
    course_code = db.Column(db.String(30), unique=True, nullable=False)
    course_name = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(20), default="Active", nullable=False)

    examinations = db.relationship(
        "Examination", back_populates="course"
    )


class Examination(db.Model):
    __tablename__ = "examinations"

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(
        db.Integer, db.ForeignKey("courses.id"), nullable=False
    )
    name = db.Column(db.String(150), nullable=False)
    exam_type = db.Column(db.String(30), nullable=False)
    duration = db.Column(db.Integer, nullable=False)
    maximum_marks = db.Column(db.Integer, nullable=False)

    slot_creation_start = db.Column(db.DateTime)
    slot_creation_end = db.Column(db.DateTime)
    booking_start = db.Column(db.DateTime)
    booking_end = db.Column(db.DateTime)

    instructions = db.Column(db.Text)
    status = db.Column(db.String(30), default="Draft", nullable=False)

    course = db.relationship("Course", back_populates="examinations")
    rubrics = db.relationship("Rubric", back_populates="examination")
    slots = db.relationship("Slot", back_populates="examination")


class Rubric(db.Model):
    __tablename__ = "rubrics"

    id = db.Column(db.Integer, primary_key=True)
    examination_id = db.Column(
        db.Integer, db.ForeignKey("examinations.id"), nullable=False
    )
    criterion_name = db.Column(db.String(150), nullable=False)
    maximum_marks = db.Column(db.Float, nullable=False)
    weightage = db.Column(db.Float, default=0)
    description = db.Column(db.Text)

    examination = db.relationship("Examination", back_populates="rubrics")


class Slot(db.Model):
    __tablename__ = "slots"

    id = db.Column(db.Integer, primary_key=True)
    examination_id = db.Column(
        db.Integer, db.ForeignKey("examinations.id"), nullable=False
    )
    examiner_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False
    )
    exam_date = db.Column(db.Date, nullable=False)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    capacity = db.Column(db.Integer, nullable=False)
    available_seats = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), default="Available", nullable=False)
    meeting_link = db.Column(db.String(500))

    examination = db.relationship("Examination", back_populates="slots")
    examiner = db.relationship("User", foreign_keys=[examiner_id])
    bookings = db.relationship("Booking", back_populates="slot")


class Booking(db.Model):
    __tablename__ = "bookings"

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False
    )
    slot_id = db.Column(
        db.Integer, db.ForeignKey("slots.id"), nullable=False
    )
    booking_date = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default="Booked", nullable=False)

    student = db.relationship("User", foreign_keys=[student_id])
    slot = db.relationship("Slot", back_populates="bookings")
    evaluation = db.relationship(
        "Evaluation", back_populates="booking", uselist=False
    )


class Evaluation(db.Model):
    __tablename__ = "evaluations"

    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(
        db.Integer, db.ForeignKey("bookings.id"), unique=True, nullable=False
    )
    student_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False
    )
    examiner_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False
    )
    total_marks = db.Column(db.Float)
    remarks = db.Column(db.Text)
    evaluation_date = db.Column(db.DateTime)
    status = db.Column(db.String(20), default="Pending", nullable=False)

    booking = db.relationship("Booking", back_populates="evaluation")
    student = db.relationship("User", foreign_keys=[student_id])
    examiner = db.relationship("User", foreign_keys=[examiner_id])