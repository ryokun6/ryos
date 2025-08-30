#!/bin/bash

# auxOS Kiosk Mode Launcher
# Launches auxOS in full-screen kiosk mode using Chromium browser


# Launch Chromium in kiosk mode with proper flags for Raspberry Pi
chromium-browser --noerrdialogs --disable-infobars --disable-pinch --overscroll-history-navigation=0 --kiosk https://os.ryo.lu