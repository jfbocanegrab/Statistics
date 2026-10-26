import logging

from app import create_app

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
application = create_app()

if __name__ == "__main__":  # desarrollo local: python wsgi.py
    application.run(host="0.0.0.0", port=8000, debug=True)
