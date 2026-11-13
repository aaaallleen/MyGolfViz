"""PyInstaller entry point for the frozen backend (`npm run api:bin`)."""

import sys

import mygolfviz_api.__main__

if __name__ == "__main__":
    sys.exit(mygolfviz_api.__main__.main())
