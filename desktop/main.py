"""Standard desktop edition: just the game in a native window (pywebview + Edge WebView2)."""
import os
import sys

import webview


def res(name):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, name)


if __name__ == "__main__":
    webview.create_window("Krillion", res("index.html"), width=1000, height=720, min_size=(640, 520))
    webview.start()
