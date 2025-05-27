import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import io from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import './App.css';

// Fix Leaflet marker icon issue
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const socket = io('http://localhost:5000', { reconnectionAttempts: 3 });

function UpdateMapCenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 13);
    }
  }, [center, map]);
  return null;
}

function App() {
  const [username, setUsername] = useState('');
  const [locations, setLocations] = useState([]);
  const [shareUrl, setShareUrl] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Get locationId from URL
  const urlParams = new URLSearchParams(window.location.search);
  const locationId = urlParams.get('locationId');

  // Fetch locations or specific location
  useEffect(() => {
    console.log('Fetching locations...');
    const fetchLocations = async () => {
      try {
        if (locationId) {
          const res = await fetch(`http://localhost:5000/api/locations/${locationId}`);
          const data = await res.json();
          if (data.error) {
            setError(data.error);
            setLocations([]);
          } else {
            setLocations([data]);
            console.log('Fetched single location:', data);
          }
        } else {
          const res = await fetch('http://localhost:5000/api/locations');
          const data = await res.json();
          setLocations(data);
          console.log('Fetched all locations:', data);
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setError('Failed to fetch locations. Is the backend running at http://localhost:5000?');
        setLocations([{
          _id: 'fallback',
          username: 'Fallback User',
          latitude: 51.505,
          longitude: -0.09,
          timestamp: new Date(),
        }]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLocations();

    socket.on('connect', () => console.log('Socket.IO connected'));
    socket.on('newLocation', (location) => {
      if (!locationId) {
        console.log('New location received:', location);
        setLocations(prev => [...prev, location]);
      }
    });
    socket.on('connect_error', (err) => {
      console.error('Socket.IO connection error:', err);
      setError('Cannot connect to backend. Please ensure the server is running on http://localhost:5000');
    });

    return () => socket.disconnect();
  }, [locationId]);

  // Handle location sharing
  const shareLocation = () => {
    if (!username) {
      setError('Please enter a username');
      return;
    }
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        console.log('Sharing location:', { username, latitude, longitude });
        fetch('http://localhost:5000/api/locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, latitude, longitude }),
        })
          .then(res => res.json())
          .then(data => {
            if (data.error) {
              setError(data.error);
            } else {
              const url = `${window.location.origin}?locationId=${data._id}`;
              setShareUrl(url);
              console.log('Location shared, URL:', url);
              if (!locationId) {
                setLocations(prev => [...prev, data]);
              }
              setError('');
            }
          })
          .catch(err => {
            console.error('Share location error:', err);
            setError('Error sharing location. Is the backend running?');
          });
      },
      (err) => {
        console.error('Geolocation error:', err);
        setError('Error getting location: ' + err.message);
      }
    );
  };

  // Copy URL to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      alert('URL copied to clipboard!');
    }).catch(err => {
      console.error('Copy URL error:', err);
      setError('Failed to copy URL');
    });
  };

  // Default map center
  const mapCenter = locations.length > 0
    ? [locations[locations.length - 1].latitude, locations[locations.length - 1].longitude]
    : [51.505, -0.09];

  if (isLoading) {
    return (
      <div className="container">
        <h1>Location Sharing App</h1>
        <p className="loading">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <h1>Location Sharing App</h1>
        <p className="error">{error}</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Location Sharing App</h1>
      {!locationId && (
        <div className="input-group">
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input"
          />
          <button onClick={shareLocation} className="button">
            Share My Location
          </button>
        </div>
      )}
      {shareUrl && !locationId && (
        <div className="share-url">
          <p>Share this URL to show your location:</p>
          <div className="url-group">
            <input type="text" value={shareUrl} readOnly className="input url-input" />
            <button onClick={copyToClipboard} className="button copy-button">
              Copy URL
            </button>
          </div>
        </div>
      )}
      <MapContainer center={mapCenter} zoom={13} style={{ height: '500px', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <UpdateMapCenter center={mapCenter} />
        {locations.map(loc => (
          <Marker key={loc._id} position={[loc.latitude, loc.longitude]}>
            <Popup>
              <b>{loc.username}</b><br />Lat: {loc.latitude}, Lng: {loc.longitude}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div className="locations">
        <h2>Shared Locations</h2>
        <ul>
          {locations.map(loc => (
            <li key={loc._id}>
              {loc.username}: Lat {loc.latitude}, Lng {loc.longitude} (Shared at {new Date(loc.timestamp).toLocaleString()})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default App;