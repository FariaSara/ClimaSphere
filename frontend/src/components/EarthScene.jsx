import React, { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, useTexture, Stars } from '@react-three/drei';
import * as THREE from 'three';

// Earth component with rotation and floating animation
function Earth() {
  const earthRef = useRef();
  const cloudRef = useRef();
  
  // Load textures for realistic Earth appearance
  const [earthTexture, normalMap, specularMap, cloudTexture] = useTexture([
    'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_specular_2048.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_clouds_1024.png'
  ]);

  // Animation frame for rotation and floating
  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    
    // Earth rotation (slow spin on Y-axis)
    if (earthRef.current) {
      earthRef.current.rotation.y = time * 0.1;
    }
    
    // Cloud rotation (slightly faster than Earth)
    if (cloudRef.current) {
      cloudRef.current.rotation.y = time * 0.12;
    }
    
    // Floating movement (subtle up-down motion)
    if (earthRef.current) {
      earthRef.current.position.y = Math.sin(time * 0.5) * 0.5;
    }
  });

  return (
    <group>
      {/* Main Earth sphere with realistic materials */}
      <Sphere ref={earthRef} args={[2, 64, 64]} position={[0, 0, 0]}>
        <meshPhongMaterial
          map={earthTexture}
          normalMap={normalMap}
          specularMap={specularMap}
          shininess={100}
          transparent={false}
        />
      </Sphere>
      
      {/* Cloud layer (slightly larger and transparent) */}
      <Sphere ref={cloudRef} args={[2.01, 32, 32]} position={[0, 0, 0]}>
        <meshPhongMaterial
          map={cloudTexture}
          transparent={true}
          opacity={0.4}
          alphaTest={0.1}
        />
      </Sphere>
      
      {/* Atmospheric glow effect */}
      <Sphere args={[2.1, 32, 32]} position={[0, 0, 0]}>
        <meshBasicMaterial
          color="#4A90E2"
          transparent={true}
          opacity={0.1}
          side={THREE.BackSide}
        />
      </Sphere>
    </group>
  );
}

// Starfield background component
function StarField() {
  return (
    <Stars
      radius={300}
      depth={60}
      count={2000}
      factor={7}
      saturation={0}
      fade={true}
      speed={1}
    />
  );
}

// Lighting setup for realistic Earth appearance
function Lighting() {
  return (
    <>
      {/* Main directional light (sun) */}
      <directionalLight
        position={[5, 3, 5]}
        intensity={1}
        color="#ffffff"
        castShadow
      />
      
      {/* Ambient light for overall illumination */}
      <ambientLight intensity={0.2} color="#404040" />
      
      {/* Point light for additional depth */}
      <pointLight
        position={[-5, -3, -5]}
        intensity={0.3}
        color="#4A90E2"
      />
    </>
  );
}


// Main EarthScene component
export default function EarthScene() {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        style={{ background: 'transparent' }}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: "high-performance"
        }}
        dpr={[1, 2]} // Limit pixel ratio for better performance
      >
        <Suspense fallback={null}>
          {/* Scene lighting */}
          <Lighting />
          
          {/* Starfield background */}
          <StarField />
          
          {/* 3D Earth with rotation and floating */}
          <Earth />
        </Suspense>
      </Canvas>
    </div>
  );
}
