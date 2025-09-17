# 📻 Retro FM Radio

[Live Demo](https://radio-seven-jet.vercel.app/) • Retro FM Radio is a single-page web app that mimics a 1970s hi-fi receiver while streaming contemporary stations from 🇸🇬 Singapore.

## 📑 Table of Contents
- [✨ Features](#-features)
- [⚙️ Prerequisites](#️-prerequisites)
- [🚀 Getting Started](#-getting-started)
- [🌐 Deployment](#-deployment)
- [🎶 How to Use](#-how-to-use)
- [📡 Extending the Station List](#-extending-the-station-list)
- [🛠️ Troubleshooting](#️-troubleshooting)
- [📜 License](#-license)

## ✨ Features
- 🎛️ Retro-styled interface with power, volume, mute, and transport controls.  
- 📻 Preset list of popular Singapore stations that can be expanded in [`app.js`](app.js).  
- 🎨 Real-time audio visualizer with multiple display styles and a light/dark theme toggle.  
- 🌐 Serverless [`api/nowplaying`](api/nowplaying.js) endpoint that retrieves ICY metadata for the current station.  
- 📝 Rolling *Now Playing* history that records recent songs pulled from the metadata feed.  

## ⚙️ Prerequisites
- 🟢 [Node.js](https://nodejs.org/) version 18 or newer for the local development server and serverless function.  
- 🌍 A modern browser with Web Audio API support such as Chrome, Edge, Firefox, or Safari.  

## 🚀 Getting Started
1. 📥 Clone this repository and move into the project directory:
   ```bash
   git clone <repo-url>
   cd radio
