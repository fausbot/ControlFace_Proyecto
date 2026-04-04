"""
main.py — Entry point for Deploy Manager.
"""
import sys
import os

# Ensure project root is in path
sys.path.insert(0, os.path.dirname(__file__))

from ui.app import DeployManagerApp


def main():
    app = DeployManagerApp()
    app.mainloop()


if __name__ == "__main__":
    main()
