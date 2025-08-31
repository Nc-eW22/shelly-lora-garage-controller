The Intelligent Shelly LoRa Garage Controller (v5.0)

Hello Shelly Community!

I'm excited to share the final version of a project I've been developing: a highly reliable, LoRa-based garage door controller. After extensive testing and refinement, it's now a robust and feature-packed solution that has been working flawlessly.

This post contains the complete overview, changelog, and detailed setup guide. The final scripts are provided at the end for you to use in your own projects. Enjoy!

Project Overview

This project provides a complete solution for creating a robust, reliable, and feature-rich LoRa-based remote control and monitoring system for a garage door using two Shelly devices. The system is designed for low-bandwidth LoRa communication, provides detailed user feedback, and maintains high reliability through a smart, event-driven architecture.

System Architecture 🏗️

The system uses a two-device approach for maximum efficiency and reliability.

🧠 Remote Device (The Brains): A Shelly 1 (Gen3 or newer) with a LoRa addon, connected directly to the garage door motor and a single "door closed" sensor. This device runs the core state machine, meaning it intelligently tracks the door's position and operates the motor locally.

📡 Controller Device (The Hub): Any Shelly (Gen3 or newer) that supports a LoRa addon (e.g., a Shelly 1PM) and has a WiFi connection. This device acts as the user interface, hosting virtual components in the Shelly app for control and status monitoring.

Security & Failsafe Features 🛡️

Encrypted Communication: All LoRa messages between the devices are secured with AES encryption.

Command Acknowledgment (ACK) & Retry: The Controller waits for a reply from the Remote after sending a command. If no reply is received, it flags a "No Reply" error (E5) on the UI and retries the command once.

Persistent Error State: If the door fails to open or close correctly, the system enters and remains in an ERROR state, providing a clear visual indication of a problem.

Smart Error Recovery: The system can automatically recover from a "slow start" stall error. If the door begins moving shortly after an E1 error is declared, the script automatically clears the error and resumes the opening sequence.

Absolute Position Reset: The "door closed" sensor is the ultimate source of truth. Whenever the sensor is activated, it will override any other state (including ERROR) and reset the system to the secure CLOSED state.

Core Logic & Features ✨
Intelligent State Machine: Using only a single door sensor and a configurable travel timer, the remote device accurately tracks the door's state. It even remembers the last direction of travel to correctly handle stop/start commands.

Rich User Interface: The Controller device provides clear feedback through virtual components, including a main trigger switch and a sub-status icon (✅, ⬆️, ⬇️, 🛑, ⚠️). Extracted virtual devices can be displayed on Shelly app dashboards for quick access.

Ecosystem Integration: The Controller's physical output can be linked to the door's state, allowing you to trigger other Shelly scenes. Shelly Premium members can also use the virtual components directly to trigger scenes, such as creating a notification when the ERROR status appears.

This project also has a detailed roadmap for a future v4.0 Garage Management System, which includes plans for Shelly BLU integration, a LoRa-AP bridge mode, and advanced sensing for things like vehicle occupancy.

Changelog: v1.0 to v2.0
This log details the major improvements from the initial concept to the final published version, based on the project roadmap last updated on August 9, 2025.

[v2.0] - 2025-08-31
🚀 New Features

🖥️ Descriptive UI: Added virtual Enum components on the controller to display rich text status (Open, Closing, etc.) and a direction arrow (↑ or ↓).

❤️ Reliability Heartbeat: The remote device now periodically re-broadcasts its status, ensuring the controller's display is always accurate, even if a message is missed.

🎬 Local Scene Trigger: The controller's physical output can now be linked to the door's state, allowing integration with other Shelly scenes and notifications.

🔬 Diagnostic View: A dedicated virtual boolean was added to the controller to show the raw, unfiltered state of the physical door sensor for easy diagnostics.

🔧 Improvements

📡 Communication Protocol: Radically optimized the LoRa protocol by replacing verbose RPC commands with a compact, single-character dictionary, significantly reducing message size.

⚙️ Centralized Configuration: All user-configurable settings in both scripts have been moved into a single, clearly-commented CONFIG block for much easier setup.

📝 Enhanced Logging: Log messages are now more descriptive and context-aware, making debugging easier without flooding the console.

✨ Code Standardization: Both scripts have been fully cleaned, formatted, and organized with clear section titles for better readability and public sharing.

🧠 Logic Changes

🤖 Intelligent State Machine: The core logic was moved entirely to the remote device, allowing it to operate autonomously. The state machine was enhanced to track the last direction of travel to handle stop/start commands logically.

⚠️ Persistent Error State: The ERROR state is now persistent to alert the user of a problem. It is only cleared when the physical "door closed" sensor is triggered, providing a definitive reset based on the door's actual position.

✅ Smart Error Recovery: The remote script can now automatically recover from a "slow start" error, where the door fails the initial movement check but starts moving shortly after, preventing it from getting stuck in an error state unnecessarily.

Installation & Setup Guide
Welcome! This guide will walk you through setting up your intelligent Shelly LoRa Garage Controller.

🏆 The Final Result
When you are finished, you will have a clean, unified virtual device in your Shelly app that shows the complete status of your garage door at a glance and provides simple one-touch control. The final result is a single device card in your Shelly app dashboard that will show a large garage icon, the primary status like "Closed", a direction arrow, and the main power button for control.

🧰 Required Hardware
Remote Device: 1x Shelly 1 (Gen3 or newer).

Controller Device: 1x Shelly (Gen3 or newer) that supports the LoRa addon (e.g., Shelly 1PM).

LoRa Addons: 2x Shelly LoRa Addons are required.

Sensor: 1x Magnetic reed switch or other sensor for the "door closed" position.

Part 1: The Remote Device (Shelly 1)
🧠 This device connects to your garage equipment and acts as the brains of the operation.

📡 Initial Access & WiFi Setup
Choose one option to access the web interface to install the script:

Option A: Access Point Mode (Recommended): In Shelly settings, enable the Access Point and set a secure password. Connect to this WiFi network from your phone/laptop to access the web UI.

Option B: Mobile Hotspot: Configure the Shelly's WiFi to connect to your phone's mobile hotspot.

🔧 Physical Installation
Power: Connect the Shelly 1 to your 12V DC power supply.

Sensor: Connect your "door closed" sensor to the SW and - terminals.

Motor: Connect the motor's two low-voltage trigger terminals across the Shelly's 'I' (Input) and 'O' (Output) dry contact terminals.

⚙️ Shelly Device Settings
Device Name: Set to Lora Door Remote.

LoRa: Enable the Lora addon.

Relay Settings: Set Type to Switch, enable Detached mode, set Power on Default to Turn OFF, and set a Timer for Auto OFF after 1 second.

Part 2: The Controller Device (Shelly 1PM, etc.)
🏠 This is your WiFi-connected hub.

🔧 Physical Installation & Settings
Power: Connect the Shelly to a stable power source (e.g., 240V AC).

WiFi: Connect the device to your home WiFi network.

Device Name: Set to Lora Door Controller.

LoRa: Enable the Lora addon.

Output Settings: For the physical output, set its Type to Button and mode to Momentary.

🪄 Step-by-Step: Creating the Virtual User Interface
Follow these steps carefully on your Controller Device.

Create a Virtual Group: Go to "Virtual Components" and create a new group. Name it Garage Door.

Add Components (In Order): Add the following four components to the group in this exact order.

Component 1 (Button): Add a boolean switch. Name it Garage Trigger.

Component 2 (Sensor): Add a boolean sensor. Name it Door Sensor.

Component 3 (Status): Add an enum. Name it Door Status.

Component 4 (Sub-Status): Add an enum. Name it Sub-Status.

Extract Virtual Device: From the Shelly app, select the "Garage Door" group and choose to extract as a virtual device.

Note: Standard Shelly accounts are limited to 1 virtual device; Pro accounts can have up to 10.

Customize App UI: Open the new virtual device and go to App Settings > Device Card Customization. Set the Big Param to Garage Trigger and the Small Params in order: Door Sensor, Door Status, Sub-Status.

Part 3: Script Configuration & Finalization
🧩 This workflow makes it easy to get the MAC addresses and finalize the setup.

Install Scripts: Paste the corresponding script code on each device. Do not edit the CONFIG block yet. Save the scripts.

Get MAC Addresses: Enable each script and open its log/console to find the message This device's MAC ID is: .... Copy both MAC addresses.

Configure Scripts: Paste the other device's MAC address into the TARGET_ID field of each script.

⚠️ IMPORTANT: MAC addresses are case-sensitive.

Final Calibration & Settings: On the Remote script, calibrate DOOR_TRAVEL_TIME_MS. On both scripts, ensure "Enable script to run on boot" is checked. Save both scripts.

💡 Note on Initial Appearance: The enum labels will look blank at first. This is normal. The script will automatically populate them. Restarting the script will fix any accidental changes.

Part 4: A Note on LoRa Usage Limits (Duty Cycle)
The "limit reached" error seen during heavy testing is a built-in safety feature. In the EU, devices are limited to transmitting for 36 seconds per hour. For any normal residential use, you will never hit this limit. If you do during testing, you must either wait or power-cycle the remote device to reset its internal counter.

Part 5: Final Testing
🏁 Time to see it in action!

Open the Shelly app and test your new "Garage Door" virtual device through a full open and close cycle. Congratulations!
