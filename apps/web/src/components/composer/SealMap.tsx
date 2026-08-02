'use client';

import L from 'leaflet';
import { useState } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';

// Leaflet's default marker icon references image paths that don't survive
// bundling under Turbopack/webpack — pointing at the CDN copies is the
// standard workaround rather than wiring up asset-loader config for a
// handful of tiny icon files.
const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const MIN_RADIUS_M = 100;
const MAX_RADIUS_M = 50_000;

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function SealMap({
  lat,
  lng,
  radiusM,
  onChange,
}: {
  lat?: number;
  lng?: number;
  radiusM: number;
  onChange: (lat: number, lng: number, radiusM: number) => void;
}) {
  const [position, setPosition] = useState<[number, number]>(lat !== undefined && lng !== undefined ? [lat, lng] : [40.7128, -74.006]);
  const [radius, setRadius] = useState(radiusM);

  function handlePick(newLat: number, newLng: number) {
    setPosition([newLat, newLng]);
    onChange(newLat, newLng, radius);
  }

  function handleRadius(newRadius: number) {
    setRadius(newRadius);
    onChange(position[0], position[1], newRadius);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="h-56 overflow-hidden rounded-[var(--radius-card)]">
        <MapContainer center={position} zoom={11} style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ClickHandler onClick={handlePick} />
          <Marker position={position} icon={markerIcon} />
          <Circle center={position} radius={radius} />
        </MapContainer>
      </div>
      <label className="flex flex-col gap-1 text-[length:var(--text-caption)] text-secondary">
        Radius: {radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}
        <input
          type="range"
          min={MIN_RADIUS_M}
          max={MAX_RADIUS_M}
          step={100}
          value={radius}
          onChange={(e) => handleRadius(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
