#!/bin/bash

# ZiOS Kiosk Mode Launcher
# Launches ZiOS in full-screen kiosk mode using Chromium browser


# Launch Chromium in kiosk mode with proper flags for Raspberry Pi
chromium-browser --noerrdialogs --disable-infobars --disable-pinch --overscroll-history-navigation=0 --kiosk https://bravohenry.com