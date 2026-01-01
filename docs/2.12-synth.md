# Synth

Synth is a versatile virtual synthesizer for ryOS, enabling users to create and experiment with a wide range of sounds. It combines powerful audio synthesis capabilities with a unique 3D waveform visualization, making sound design an intuitive and engaging experience.

## Overview

The Synth app transforms your ryOS desktop into a dynamic sound studio, offering real-time sound generation and manipulation. Built with Tone.js for robust audio processing and Three.js for captivating visual feedback, Synth provides a platform for both novice and experienced musicians to explore electronic soundscapes. Users can craft custom instrument sounds, experiment with various effects, and visualize their creations through an interactive 3D waveform display. It's an ideal tool for music production, sound design, or simply having fun with audio.

## Features

Synth provides a rich set of features designed to offer a comprehensive synthesis experience:

*   **Virtual Keyboard**: Play notes directly using the on-screen keyboard or by mapping notes to your computer keyboard for a more responsive playing experience.
*   **Controls Panel**: Access a dedicated panel to fine-tune various aspects of your sound, including oscillator types, envelope parameters (attack, decay, sustain, release), and effect settings.
*   **Presets Management**: Save your custom sound configurations as presets, load previously saved sounds, and easily manage your library of unique tones.
*   **3D Waveform Visualization**: Experience a live, animated 3D representation of your sound's waveform, providing immediate visual feedback that reacts to your adjustments in real-time when the controls panel is open.
*   **Integrated Effects Suite**: Enhance your sounds with a comprehensive array of built-in effects, including Reverb, Delay, Distortion, Chorus, Phaser, and a Bit-Crusher for lo-fi textures.
*   **MIDI Input Support**: Seamlessly integrate your external MIDI keyboard or controller. Simply plug it in, and Synth will recognize it, allowing for instant playability and expressive control.

## User Guide

### Getting Started
To launch Synth, locate its icon in the ryOS app launcher and click on it. Once open, you can immediately begin playing notes using the on-screen virtual keyboard or your computer's keyboard. To unlock its full potential, toggle the "CONTROLS" panel from the menu bar to access sound customization options.

### Key Actions

*   **Play Notes**: Use the virtual keyboard by clicking on the keys, or map notes to your computer keyboard for quicker input.
*   **Adjust Sound Parameters**: Open the "CONTROLS" panel. Use the various dials and selectors to change oscillator types, modify the ADSR envelope, and tweak individual effect settings.
*   **Manage Presets**: Navigate to the "Presets" option in the menu bar to save your current sound, load existing presets, or browse through your custom sound library.
*   **Visualize Your Sound**: Ensure the "CONTROLS" panel is open to activate the dynamic 3D waveform visualization, which updates in real-time as you play and adjust parameters.
*   **Connect MIDI Device**: Plug in your MIDI keyboard or controller. Synth automatically detects MIDI input, allowing you to play and control the synthesizer with your external hardware.

### Tips & Shortcuts
*   **Computer Keyboard Mapping**: Experiment with your computer keyboard to find a comfortable layout for playing notes, often mapped to rows like 'QWERTY' for white keys and 'ASDFGH' for black keys.
*   **Visual Feedback**: Keep the Controls Panel open to fully utilize the 3D waveform visualization, which is a powerful tool for understanding how your sound is being shaped.
*   **Fine-Tuning Dials**: Dials can be adjusted by clicking and dragging. For precise adjustments, drag slowly or use small, incremental movements.

## Technical Details

### Window Configuration
*   **Default size**: 720×400px
*   **Minimum size**: 720×290px

### Component Architecture
The app consists of 3 component file(s):

*   `components/SynthAppComponent.tsx`: The main application component that orchestrates the synthesizer logic, UI, and state.
*   `components/SynthMenuBar.tsx`: Handles the application's menu bar, providing access to help, about, and preset management options.
*   `components/Waveform3D.tsx`: Manages the Three.js rendering of the interactive 3D waveform visualization.

### Hooks & Utilities

No custom hooks or utilities.

### State Management
Synth utilizes a centralized state management approach through the `useSynthStore` (a Zustand store). This store manages all application settings, including oscillator parameters, envelope settings, effect configurations, active presets, and various UI states, ensuring a consistent and reactive user experience.

## Related Apps

Synth pairs well with other creative tools in ryOS. Consider exporting your synthesized audio to a hypothetical ryOS Music Player for playback or integrating with an Audio Recorder app for capturing your performances.
