import './App.css';
import HandCanvas from './HandCanvas';

const App: React.FC = () => {
  return (
    <div className="App">
      <h2 style={{ color: '#2196f3', marginTop: 24 }}>Hand Tracking & Drawing Demo</h2>
      <HandCanvas />
      <p style={{ marginTop: 24 }}>
        Move your finger in front of the camera to draw!<br/>
        Powered by MediaPipe, React, and GSAP.
      </p>
    </div>
  );
};

export default App; 