import asyncio
import websockets
import json
import threading
import customtkinter as ctk
import queue
import pickle
import os
import re
try:
    from pynput.keyboard import Key, Controller
    PYNPUT_AVAILABLE = True
except ImportError:
    print("Warning: pynput not available. Keyboard shortcuts will not work.")
    PYNPUT_AVAILABLE = False
    Key = None
    Controller = None

class CommentaryServer:
    def __init__(self):
        self.clients = set()
        self.commentaries = []
        self.ui_queue = queue.Queue()
        self.keyword_monitoring_active = False
        self.keyword_shortcuts = {}
        self._keyboard_controller = None
        
    async def register_client(self, websocket):
        self.clients.add(websocket)
        print(f"Client connected. Total clients: {len(self.clients)}")
        
        # Update UI with new client count
        self.ui_queue.put(("clients", len(self.clients)))
        
        # Send existing commentaries to new client
        if self.commentaries:
            await websocket.send(json.dumps({
                "type": "initial_data",
                "commentaries": self.commentaries
            }))
    
    async def unregister_client(self, websocket):
        self.clients.discard(websocket)
        print(f"Client disconnected. Total clients: {len(self.clients)}")
        
        # Update UI with new client count
        self.ui_queue.put(("clients", len(self.clients)))
    
    async def handle_message(self, websocket, message):
        try:
            print(f"📨 Received message: {message[:100]}...")
            data = json.loads(message)
            
            if data.get("type") == "commentary_update":
                # Add new commentary
                commentary = {
                    "text": data.get("text", ""),
                    "index": len(self.commentaries)
                }
                self.commentaries.append(commentary)
                
                print(f"📝 New commentary added: {commentary['text'][:50]}... (monitoring: {self.keyword_monitoring_active})")
                
                # Update UI
                self.ui_queue.put(("add", commentary))
                
                # Check for keyword matches if monitoring is active
                if self.keyword_monitoring_active:
                    print("🔍 Checking keywords...")
                    self.check_keywords(commentary["text"])
                
                # Update status to show activity
                self.ui_queue.put(("status", f"Running on ws://localhost:8765 - Last update: {len(self.commentaries)} commentaries"))
                
                # Broadcast to all clients
                broadcast_data = {
                    "type": "new_commentary",
                    "commentary": commentary
                }
                
                # Send to all connected clients
                if self.clients:
                    await asyncio.gather(
                        *[client.send(json.dumps(broadcast_data)) for client in self.clients],
                        return_exceptions=True
                    )
                    print(f"📤 Broadcasted to {len(self.clients)} clients")
                    
        except json.JSONDecodeError:
            print(f"Invalid JSON received")
        except Exception as e:
            print(f"Error handling message: {e}")
    
    def check_keywords(self, text):
        """Check if any keywords are found in the text and trigger shortcuts"""
        try:
            print(f"Checking keywords in text: '{text[:50]}...' (monitoring active: {self.keyword_monitoring_active})")
            
            if not self.keyword_monitoring_active:
                return
                
            if not self.keyword_shortcuts:
                print("No keywords configured")
                return
                
            text_lower = text.lower()
            for keyword, shortcut in self.keyword_shortcuts.items():
                if keyword.lower() in text_lower:
                    print(f"✅ Keyword '{keyword}' found in text! Triggering shortcut: {shortcut}")
                    self.ui_queue.put(("keyword_match", {"keyword": keyword, "shortcut": shortcut, "text": text}))
                    # Trigger the keyboard shortcut in a separate thread to avoid blocking
                    threading.Thread(target=self._safe_trigger_shortcut, args=(shortcut,), daemon=True).start()
                    break  # Only trigger the first match
        except Exception as e:
            print(f"Error in check_keywords: {e}")
    
    def _safe_trigger_shortcut(self, shortcut):
        """Safely trigger a shortcut with additional error handling"""
        try:
            # Add a small delay to ensure we don't interfere with the main thread
            import time
            time.sleep(0.1)
            self.trigger_shortcut(shortcut)
        except Exception as e:
            print(f"Error in _safe_trigger_shortcut: {e}")
    
    @property
    def keyboard_controller(self):
        """Lazy-load the keyboard controller to avoid initialization conflicts"""
        if self._keyboard_controller is None and PYNPUT_AVAILABLE:
            try:
                self._keyboard_controller = Controller()
                print("Keyboard controller initialized successfully")
            except Exception as e:
                print(f"Failed to initialize keyboard controller: {e}")
                return None
        return self._keyboard_controller
    
    def trigger_shortcut(self, shortcut):
        """Trigger a keyboard shortcut"""
        if not PYNPUT_AVAILABLE:
            print(f"Cannot trigger shortcut '{shortcut}': pynput not available")
            return
            
        controller = self.keyboard_controller
        if controller is None:
            print(f"Cannot trigger shortcut '{shortcut}': controller not available")
            return
            
        try:
            print(f"Triggering shortcut: {shortcut}")
            
            # Parse shortcut string and trigger it
            keys = shortcut.lower().split('+')
            
            # Handle modifier keys
            modifiers = []
            regular_key = None
            
            for key in keys:
                key = key.strip()
                if key == 'ctrl':
                    modifiers.append(Key.ctrl)
                elif key == 'alt':
                    modifiers.append(Key.alt)
                elif key == 'shift':
                    modifiers.append(Key.shift)
                elif key == 'cmd' or key == 'win':
                    modifiers.append(Key.cmd)
                else:
                    regular_key = key
            
            # Press modifiers first
            for modifier in modifiers:
                controller.press(modifier)
            
            # Press the main key
            if regular_key:
                if len(regular_key) == 1:
                    controller.press(regular_key)
                    controller.release(regular_key)
                else:
                    # Handle special keys
                    special_key = getattr(Key, regular_key, None)
                    if special_key:
                        controller.press(special_key)
                        controller.release(special_key)
                    else:
                        print(f"Unknown special key: {regular_key}")
            
            # Release modifiers
            for modifier in reversed(modifiers):
                controller.release(modifier)
            
            print(f"Successfully triggered shortcut: {shortcut}")
                
        except Exception as e:
            print(f"Error triggering shortcut '{shortcut}': {e}")
    
    def set_keyword_shortcuts(self, keyword_shortcuts):
        """Update the keyword-shortcut mappings"""
        self.keyword_shortcuts = keyword_shortcuts.copy()
        print(f"Updated keyword shortcuts: {self.keyword_shortcuts}")
    
    def start_monitoring(self):
        """Start keyword monitoring"""
        print(f"🟢 Starting keyword monitoring... (Keywords: {list(self.keyword_shortcuts.keys())})")
        self.keyword_monitoring_active = True
        self.ui_queue.put(("monitoring_status", True))
        print(f"✅ Keyword monitoring started successfully. Active: {self.keyword_monitoring_active}")
    
    def stop_monitoring(self):
        """Stop keyword monitoring"""
        print("🔴 Stopping keyword monitoring...")
        self.keyword_monitoring_active = False
        self.ui_queue.put(("monitoring_status", False))
        print(f"✅ Keyword monitoring stopped. Active: {self.keyword_monitoring_active}")
    
    async def client_handler(self, websocket):
        await self.register_client(websocket)
        try:
            async for message in websocket:
                await self.handle_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            await self.unregister_client(websocket)

class SettingsWindow:
    def __init__(self, parent_ui):
        self.parent_ui = parent_ui
        self.keyword_shortcuts = {}
        self.load_settings()
        
        # Create settings window
        self.window = ctk.CTkToplevel(parent_ui.root)
        self.window.title("Settings - Keyword & Shortcut Configuration")
        self.window.geometry("800x600")
        self.window.grab_set()  # Make it modal
        
        self.setup_ui()
        
    def setup_ui(self):
        # Title
        title_label = ctk.CTkLabel(self.window, text="Keyword & Shortcut Settings", 
                                  font=ctk.CTkFont(size=20, weight="bold"))
        title_label.pack(pady=20)
        
        # Instructions
        instructions = ctk.CTkLabel(self.window, 
                                   text="Configure keywords and their corresponding keyboard shortcuts.\nWhen a keyword is detected in commentary, the shortcut will be triggered automatically.",
                                   font=ctk.CTkFont(size=12))
        instructions.pack(pady=10)
        
        # Scrollable frame for keyword-shortcut pairs
        self.scrollable_frame = ctk.CTkScrollableFrame(self.window, height=300)
        self.scrollable_frame.pack(fill="both", expand=True, padx=20, pady=10)
        
        # Load existing settings into UI
        self.keyword_frames = []
        for keyword, shortcut in self.keyword_shortcuts.items():
            self.add_keyword_row(keyword, shortcut)
        
        # If no existing settings, add one empty row
        if not self.keyword_shortcuts:
            self.add_keyword_row("", "")
        
        # Add button
        add_btn = ctk.CTkButton(self.window, text="+ Add New Keyword", 
                               command=lambda: self.add_keyword_row("", ""),
                               fg_color="#27ae60", hover_color="#229954")
        add_btn.pack(pady=10)
        
        # Button frame
        button_frame = ctk.CTkFrame(self.window)
        button_frame.pack(fill="x", padx=20, pady=20)
        
        # Save button
        save_btn = ctk.CTkButton(button_frame, text="Save Settings", 
                                command=self.save_settings,
                                fg_color="#3498db", hover_color="#2980b9")
        save_btn.pack(side="left", padx=10)
        
        # Cancel button
        cancel_btn = ctk.CTkButton(button_frame, text="Cancel", 
                                  command=self.window.destroy,
                                  fg_color="#95a5a6", hover_color="#7f8c8d")
        cancel_btn.pack(side="right", padx=10)
        
        # Help text
        help_text = ctk.CTkLabel(self.window, 
                                text="Shortcut examples: 'ctrl+c', 'alt+tab', 'f1', 'space', 'enter'",
                                font=ctk.CTkFont(size=10))
        help_text.pack(pady=5)
    
    def add_keyword_row(self, keyword="", shortcut=""):
        # Frame for this keyword-shortcut pair
        row_frame = ctk.CTkFrame(self.scrollable_frame)
        row_frame.pack(fill="x", padx=5, pady=5)
        
        # Keyword entry
        ctk.CTkLabel(row_frame, text="Keyword:", width=80).pack(side="left", padx=5)
        keyword_entry = ctk.CTkEntry(row_frame, placeholder_text="Enter keyword to detect", width=200)
        keyword_entry.pack(side="left", padx=5)
        keyword_entry.insert(0, keyword)
        
        # Shortcut entry
        ctk.CTkLabel(row_frame, text="Shortcut:", width=80).pack(side="left", padx=5)
        shortcut_entry = ctk.CTkEntry(row_frame, placeholder_text="e.g., ctrl+c, f1, space", width=150)
        shortcut_entry.pack(side="left", padx=5)
        shortcut_entry.insert(0, shortcut)
        
        # Remove button
        remove_btn = ctk.CTkButton(row_frame, text="✕", width=30, height=30,
                                  command=lambda: self.remove_keyword_row(row_frame),
                                  fg_color="#e74c3c", hover_color="#c0392b")
        remove_btn.pack(side="right", padx=5)
        
        # Store the frame and entries
        self.keyword_frames.append({
            'frame': row_frame,
            'keyword_entry': keyword_entry,
            'shortcut_entry': shortcut_entry
        })
    
    def remove_keyword_row(self, frame_to_remove):
        # Find and remove the frame from our list
        self.keyword_frames = [kf for kf in self.keyword_frames if kf['frame'] != frame_to_remove]
        # Destroy the frame
        frame_to_remove.destroy()
    
    def save_settings(self):
        # Collect all keyword-shortcut pairs from the UI
        new_settings = {}
        for kf in self.keyword_frames:
            keyword = kf['keyword_entry'].get().strip()
            shortcut = kf['shortcut_entry'].get().strip()
            if keyword and shortcut:  # Only save non-empty pairs
                new_settings[keyword] = shortcut
        
        self.keyword_shortcuts = new_settings
        
        # Save to file
        try:
            with open('settings.pkl', 'wb') as f:
                pickle.dump(self.keyword_shortcuts, f)
            print(f"Settings saved: {self.keyword_shortcuts}")
        except Exception as e:
            print(f"Error saving settings: {e}")
        
        # Update the server with new settings
        self.parent_ui.server.set_keyword_shortcuts(self.keyword_shortcuts)
        
        # Update parent UI to show current settings
        self.parent_ui.update_settings_display()
        
        # Close window
        self.window.destroy()
    
    def load_settings(self):
        try:
            if os.path.exists('settings.pkl'):
                with open('settings.pkl', 'rb') as f:
                    self.keyword_shortcuts = pickle.load(f)
                print(f"Settings loaded: {self.keyword_shortcuts}")
            else:
                self.keyword_shortcuts = {}
        except Exception as e:
            print(f"Error loading settings: {e}")
            self.keyword_shortcuts = {}

class CommentaryUI:
    def __init__(self, server):
        self.server = server
        self.monitoring_active = False
        
        # Set appearance and color theme
        ctk.set_appearance_mode("dark")  # "light" or "dark"
        ctk.set_default_color_theme("blue")  # "blue", "green", "dark-blue"
        
        self.root = ctk.CTk()
        self.root.title("Real-time Commentary Monitor")
        self.root.geometry("950x750")
        
        # Load initial settings
        self.load_initial_settings()
        
        # Create UI elements
        self.setup_ui()
        
        # Start checking for updates
        self.check_updates()
    
    def setup_ui(self):
        # Title and settings frame
        header_frame = ctk.CTkFrame(self.root)
        header_frame.pack(fill="x", padx=20, pady=10)
        
        title_label = ctk.CTkLabel(header_frame, text="Commentary Monitor", 
                                  font=ctk.CTkFont(size=24, weight="bold"))
        title_label.pack(side="left", padx=20, pady=15)
        
        # Settings button
        settings_btn = ctk.CTkButton(header_frame, text="⚙️ Settings", 
                                   command=self.open_settings,
                                   fg_color="#9b59b6", hover_color="#8e44ad",
                                   font=ctk.CTkFont(size=14, weight="bold"))
        settings_btn.pack(side="right", padx=20, pady=15)
        
        # Status frame
        status_frame = ctk.CTkFrame(self.root)
        status_frame.pack(fill="x", padx=20, pady=5)
        
        self.status_label = ctk.CTkLabel(status_frame, text="Server Status: Starting...", 
                                        font=ctk.CTkFont(size=12))
        self.status_label.pack(side="left", padx=20, pady=10)
        
        self.client_count_label = ctk.CTkLabel(status_frame, text="Clients: 0", 
                                              font=ctk.CTkFont(size=12))
        self.client_count_label.pack(side="right", padx=20, pady=10)
        
        # Monitoring control frame
        control_frame = ctk.CTkFrame(self.root)
        control_frame.pack(fill="x", padx=20, pady=10)
        
        # Monitoring status
        self.monitoring_label = ctk.CTkLabel(control_frame, text="Keyword Monitoring: Stopped", 
                                           font=ctk.CTkFont(size=14, weight="bold"))
        self.monitoring_label.pack(side="left", padx=20, pady=15)
        
        # Start/Stop buttons frame
        button_frame = ctk.CTkFrame(control_frame)
        button_frame.pack(side="right", padx=20, pady=10)
        
        self.start_btn = ctk.CTkButton(button_frame, text="▶️ Start Monitoring", 
                                     command=self.start_monitoring,
                                     fg_color="#27ae60", hover_color="#229954",
                                     font=ctk.CTkFont(size=12, weight="bold"))
        self.start_btn.pack(side="left", padx=5)
        
        self.stop_btn = ctk.CTkButton(button_frame, text="⏹️ Stop Monitoring", 
                                    command=self.stop_monitoring,
                                    fg_color="#e74c3c", hover_color="#c0392b",
                                    font=ctk.CTkFont(size=12, weight="bold"))
        self.stop_btn.pack(side="left", padx=5)
        
        # Keywords display frame
        keywords_frame = ctk.CTkFrame(self.root)
        keywords_frame.pack(fill="x", padx=20, pady=5)
        
        ctk.CTkLabel(keywords_frame, text="Active Keywords:", 
                    font=ctk.CTkFont(size=12, weight="bold")).pack(side="left", padx=10, pady=5)
        
        self.keywords_display = ctk.CTkLabel(keywords_frame, text="None configured", 
                                           font=ctk.CTkFont(size=10))
        self.keywords_display.pack(side="left", padx=10, pady=5)
        
        # Commentary display
        self.commentary_text = ctk.CTkTextbox(
            self.root, 
            height=300,
            font=ctk.CTkFont(size=12),
            wrap="word"
        )
        self.commentary_text.pack(fill="both", expand=True, padx=20, pady=10)
        
        # Keyword matches display
        matches_frame = ctk.CTkFrame(self.root)
        matches_frame.pack(fill="x", padx=20, pady=5)
        
        ctk.CTkLabel(matches_frame, text="Recent Keyword Matches:", 
                    font=ctk.CTkFont(size=12, weight="bold")).pack(anchor="w", padx=10, pady=5)
        
        self.matches_text = ctk.CTkTextbox(matches_frame, height=60, font=ctk.CTkFont(size=10))
        self.matches_text.pack(fill="x", padx=10, pady=5)
        
        # Clear button
        clear_btn = ctk.CTkButton(self.root, text="Clear All", 
                                 command=self.clear_commentaries,
                                 fg_color="#95a5a6",
                                 hover_color="#7f8c8d",
                                 font=ctk.CTkFont(size=14, weight="bold"))
        clear_btn.pack(pady=10)
        
        # Initial button states and settings display
        self.update_monitoring_buttons()
        self.update_settings_display()
        
    def update_status(self, status):
        print(f"UI: Updating status - {status}")
        self.status_label.configure(text=f"Server Status: {status}")
        
    def update_client_count(self, count):
        print(f"UI: Updating client count - {count}")
        self.client_count_label.configure(text=f"Clients: {count}")
        
    def add_commentary(self, commentary):
        # Process commentary text to put time and text on same line
        text = commentary['text']
        
        # Replace newlines with spaces to put everything on one line
        formatted_text = text.replace('\n', ' ').replace('\r', ' ')
        
        # Clean up extra spaces
        formatted_text = ' '.join(formatted_text.split())
        
        print(f"UI: Adding commentary - {formatted_text}")
        # Insert at the beginning (top) instead of end
        self.commentary_text.insert("1.0", f"{formatted_text}\n")
        
        # Auto-scroll to top to show newest content
        self.commentary_text.see("1.0")
        
    def load_initial_settings(self):
        """Load settings on startup and apply them to server"""
        try:
            if os.path.exists('settings.pkl'):
                with open('settings.pkl', 'rb') as f:
                    settings = pickle.load(f)
                    self.server.set_keyword_shortcuts(settings)
                    print(f"Initial settings loaded: {settings}")
        except Exception as e:
            print(f"Error loading initial settings: {e}")
    
    def open_settings(self):
        """Open the settings window"""
        SettingsWindow(self)
    
    def start_monitoring(self):
        """Start keyword monitoring"""
        self.monitoring_active = True
        self.server.start_monitoring()
        self.update_monitoring_buttons()
    
    def stop_monitoring(self):
        """Stop keyword monitoring"""
        self.monitoring_active = False
        self.server.stop_monitoring()
        self.update_monitoring_buttons()
    
    def update_monitoring_buttons(self):
        """Update the appearance of start/stop buttons based on monitoring state"""
        if self.monitoring_active:
            self.monitoring_label.configure(text="Keyword Monitoring: Active", text_color="#27ae60")
            self.start_btn.configure(state="disabled")
            self.stop_btn.configure(state="normal")
        else:
            self.monitoring_label.configure(text="Keyword Monitoring: Stopped", text_color="#e74c3c")
            self.start_btn.configure(state="normal") 
            self.stop_btn.configure(state="disabled")
    
    def update_settings_display(self):
        """Update the keywords display with current settings"""
        keywords = list(self.server.keyword_shortcuts.keys())
        if keywords:
            display_text = ", ".join(keywords[:5])  # Show first 5 keywords
            if len(keywords) > 5:
                display_text += f" (+{len(keywords)-5} more)"
        else:
            display_text = "None configured"
        self.keywords_display.configure(text=display_text)
    
    def add_keyword_match(self, match_data):
        """Add a keyword match to the matches display"""
        keyword = match_data['keyword']
        shortcut = match_data['shortcut']
        match_text = f"🎯 '{keyword}' → {shortcut}\n"
        
        # Insert at the beginning
        self.matches_text.insert("1.0", match_text)
        
        # Keep only last 10 matches (approximately)
        content = self.matches_text.get("1.0", "end")
        lines = content.split('\n')
        if len(lines) > 10:
            # Keep only first 10 lines
            new_content = '\n'.join(lines[:10])
            self.matches_text.delete("1.0", "end")
            self.matches_text.insert("1.0", new_content)
    
    def clear_commentaries(self):
        """Clear all commentary and matches"""
        self.commentary_text.delete("1.0", "end")
        self.matches_text.delete("1.0", "end")
        self.server.commentaries.clear()
        
    def check_updates(self):
        try:
            while not self.server.ui_queue.empty():
                action, data = self.server.ui_queue.get_nowait()
                if action == "add":
                    self.add_commentary(data)
                elif action == "status":
                    self.update_status(data)
                elif action == "clients":
                    self.update_client_count(data)
                elif action == "keyword_match":
                    self.add_keyword_match(data)
                elif action == "monitoring_status":
                    self.monitoring_active = data
                    self.update_monitoring_buttons()
        except queue.Empty:
            pass
        
        # Schedule next check
        self.root.after(100, self.check_updates)
    
    def run(self):
        self.root.mainloop()

async def start_websocket_server(server):
    print("Starting WebSocket server on ws://localhost:8765")
    server.ui_queue.put(("status", "Running on ws://localhost:8765"))
    
    async with websockets.serve(server.client_handler, "localhost", 8765):
        await asyncio.Future()  # Run forever

def run_server():
    server = CommentaryServer()
    
    # Start UI in main thread
    ui = CommentaryUI(server)
    
    # Start WebSocket server in separate thread
    def websocket_thread():
        asyncio.run(start_websocket_server(server))
    
    ws_thread = threading.Thread(target=websocket_thread, daemon=True)
    ws_thread.start()
    
    # Update UI status and initial client count
    server.ui_queue.put(("status", "Running on ws://localhost:8765"))
    server.ui_queue.put(("clients", 0))
    
    # Run UI (blocks until window is closed)
    ui.run()

if __name__ == "__main__":
    print("Starting Commentary Server...")
    run_server()
