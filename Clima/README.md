# ClimaSphere

A modern, interactive weather application homepage built with React, Three.js, and Framer Motion. Features a stunning 3D Earth with realistic textures, smooth animations, and interactive feature cards.

## Environment variables

Create a `.env` file at the project root with:

REACT_APP_OPENWEATHER_KEY=your_openweather_api_key

Then restart the dev server.

## Features

- **3D Rotating Earth**: Realistic 3D Earth with rotation, floating movement, and atmospheric effects
- **Animated Title**: "ClimaSphere " with glow effects and smooth animations
- **Interactive Intro Text**: Dynamic text overlay with fade-in/slide animations
- **Feature Cards**: 5 interactive cards with hover effects and routing
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Modern UI/UX**: Dark theme with cyan glow effects and futuristic styling

## Tech Stack

- **React 18** - Frontend framework
- **Three.js / React Three Fiber** - 3D graphics and Earth rendering
- **Framer Motion** - Smooth animations and transitions
- **TailwindCSS** - Utility-first CSS framework
- **React Router** - Client-side routing

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ClimaSphere
```
2. Install dependencies:
```bash
npm install
```
3. Start the development server:
```bash
npm start
```
4. Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

## Project Structure

```
src/
├── components/
│   ├── EarthScene.jsx      # 3D Earth component with rotation and floating
│   ├── IntroText.jsx       # Animated intro text overlay
│   ├── FeatureCard.jsx     # Interactive feature cards
│   └── Home.jsx           # Main homepage component
├── pages/
│   ├── Forecast.jsx       # Weather forecast page
│   ├── Flood.jsx          # Flood prediction page
│   ├── Cyclone.jsx        # Cyclone prediction page
│   ├── Drought.jsx        # Drought prediction page
│   └── Education.jsx      # Educational content page
├── App.js                 # Main app component with routing
├── index.js               # React entry point
└── index.css              # Global styles and Tailwind imports
```
## Key Components

### EarthScene.jsx

- 3D Earth with realistic textures from NASA
- Smooth rotation on Y-axis
- Floating up-down movement
- Cloud layer with transparency
- Atmospheric glow effect
- Starfield background
- Optimized lighting setup

### IntroText.jsx

- Fade-in and slide animations
- Auto-hide after 8 seconds
- Glassmorphism design
- Decorative animated elements

### FeatureCard.jsx

- Hover scale and glow effects
- 3D lift animation
- Click navigation to feature pages
- Responsive design

### Home.jsx

- Main homepage integrating all components
- Animated title with glow effects
- Floating particle effects
- Scroll indicator
- Responsive layout

## Styling

- **Dark Theme**: Deep black background (#0A0A0A) with secondary dark (#1A1A1A)
- **Glow Effects**: Cyan (#00FFFF) and yellow (#FFDD00) accent colors
- **Typography**: Space Grotesk font for modern, futuristic look
- **Animations**: Smooth transitions with spring physics
- **Responsive**: Mobile-first design with breakpoints

## Performance Optimizations

- Lazy loading for 3D components
- Optimized texture loading
- Efficient animation loops
- Responsive image handling
- Minimal re-renders with React.memo

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Development

The app uses Create React App for development. Key scripts:

- `npm start` - Start development server
- `npm build` - Build for production
- `npm test` - Run tests
- `npm eject` - Eject from Create React App

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Acknowledgments

- NASA for Earth texture data
- Three.js community for 3D graphics
- Framer Motion for smooth animations
- TailwindCSS for utility-first styling
