import os

from flask import Flask, jsonify
from flask_cors import CORS
from flask_login import LoginManager

from extensions import db, login_manager
from models import User
from routes.auth import auth_bp


app = Flask(__name__)

os.makedirs(app.instance_path, exist_ok=True)

app.config["SQLALCHEMY_DATABASE_URI"] = (
    "sqlite:///" + os.path.join(app.instance_path, "examination.db")
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Use an environment variable for the session signing key.
app.config["SECRET_KEY"] = os.environ.get(
    "EMP_SECRET_KEY", "dev-only-change-this-secret-key"
)

# Session cookies are sent with same-site requests.
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

CORS(
    app,
    supports_credentials=True,
    origins=["http://localhost:8080", "http://127.0.0.1:8080"]
)

db.init_app(app)
login_manager.init_app(app)


@login_manager.user_loader
def load_user(user_id):
    try:
        return db.session.get(User, int(user_id))
    except (ValueError, TypeError):
        return None


@login_manager.unauthorized_handler
def unauthorized():
    return jsonify({"error": "Authentication required."}), 401


app.register_blueprint(auth_bp)


@app.route("/")
def home():
    return jsonify({
        "message": "Examination Management Portal API is running!",
        "status": "success"
    })


@app.route("/api/health")
def health():
    return jsonify({"status": "healthy"})


with app.app_context():
    db.create_all()

    admin = User.query.filter_by(role="admin").first()

    if admin is None:
        username = os.environ.get("EMP_ADMIN_USERNAME", "admin")
        email = os.environ.get("EMP_ADMIN_EMAIL", "admin@email.com")
        password = os.environ.get("EMP_ADMIN_PASSWORD", "admin123")

        if User.query.filter_by(username=username).first():
            raise RuntimeError("The configured Admin username already exists.")

        if User.query.filter_by(email=email).first():
            raise RuntimeError("The configured Admin email already exists.")

        admin = User(
            username=username,
            email=email,
            name="admin",
            role="admin",
            status="Active"
        )
        admin.set_password(password)

        db.session.add(admin)
        db.session.commit()

        print("Default Admin account created.")


if __name__ == "__main__":
    app.run(debug=True)