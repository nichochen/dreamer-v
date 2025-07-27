from flask import Flask
from flask_cors import CORS
from config import SQLALCHEMY_DATABASE_URI, SQLALCHEMY_TRACK_MODIFICATIONS
from database import db
from routes.video import video_bp
from routes.music import music_bp
from routes.image import image_bp
from routes.task_management import task_management_bp
from routes.utility import utility_bp
from routes.usage import usage_bp

def create_app():
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000", "http://localhost"]}})

    app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = SQLALCHEMY_TRACK_MODIFICATIONS

    db.init_app(app)

    app.register_blueprint(video_bp)
    app.register_blueprint(music_bp)
    app.register_blueprint(image_bp)
    app.register_blueprint(task_management_bp)
    app.register_blueprint(utility_bp)
    app.register_blueprint(usage_bp)

    with app.app_context():
        db.create_all()

    return app

app = create_app()

if __name__ == '__main__':
    print(f"Starting Flask app with SQLite persistence.")
    print(f"Database will be stored at: {app.config['SQLALCHEMY_DATABASE_URI']}")
    app.run(debug=False, host='0.0.0.0', port=5001)
