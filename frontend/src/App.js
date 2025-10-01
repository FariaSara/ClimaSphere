import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import Forecast from './pages/Forecast';
import Flood from './pages/Flood';
import Cyclone from './pages/Cyclone';
import Drought from './pages/Drought';
import Education from './pages/Education';
import Bushfire from './pages/Bushfire';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/forecast" element={<Forecast />} />
          <Route path="/flood" element={<Flood />} />
          <Route path="/cyclone" element={<Cyclone />} />
          <Route path="/bushfire" element={<Bushfire />} />
          <Route path="/drought" element={<Drought />} />
          <Route path="/education" element={<Education />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
















