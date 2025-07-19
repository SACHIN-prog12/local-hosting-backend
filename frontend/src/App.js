import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Gym from './components/Gym';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css'; // Your main CSS file

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Gym />} />
          {/* Add other routes if needed */}
        </Routes>
        <ToastContainer position="bottom-right" autoClose={3000} hideProgressBar newestOnTop closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover />
      </div>
    </Router>
  );
}

export default App;
