# Build configuration for creating .exe file
# This file helps ensure all dependencies are properly included

import sys
import os

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import required modules to ensure they're included in the build
try:
    import asyncio
    import websockets
    import customtkinter
    import threading
    import queue
    import pickle
    import json
    import re
    import time
    
    # Optional imports
    try:
        from pynput.keyboard import Key, Controller
        print("✓ pynput imported successfully")
    except ImportError:
        print("⚠ pynput not available")
        
    print("✓ All required modules imported successfully")
    
except ImportError as e:
    print(f"❌ Import error: {e}")
    sys.exit(1)

# Test WebSocket functionality
def test_websocket_imports():
    """Test that WebSocket functionality is available"""
    try:
        import websockets
        print("✓ websockets module available")
        
        # Test basic WebSocket functionality
        import asyncio
        print("✓ asyncio module available")
        
        return True
    except Exception as e:
        print(f"❌ WebSocket test failed: {e}")
        return False

if __name__ == "__main__":
    print("Testing build configuration...")
    if test_websocket_imports():
        print("✅ Build configuration test passed")
    else:
        print("❌ Build configuration test failed")
        sys.exit(1)
