import L from 'leaflet';
import 'leaflet.markercluster'; // adds L.markerClusterGroup; needs the global L that Leaflet sets
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { api, type Meter, type MeterPage, type Status } from '../api';
import { fmt, STATUS_LABEL } from '../format';
import { OptionSelect } from './OptionSelect';
import { StatusMark, STATUSES, statusSvg } from './StatusMark';

// Two basemaps, neither needing a key. The plain map is OpenStreetMap, greyed
// out (and inverted in dark mode) by a CSS filter so the meters carry the colour.
// Satellite is Esri World Imagery, with Esri's place names on top for orientation.
const OSM = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const SATELLITE = {
  url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
  labels: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
  attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics and the GIS User Community',
};
type Basemap = 'map' | 'satellite';
const JAIPUR: L.LatLngExpression = [26.91, 75.79];

// The same status icons as everywhere else, 22px (a comfortable hit target),
// 30px when selected. Six icons in all, built once.
const icons = new Map<string, L.DivIcon>();
function icon(status: Status, selected: boolean): L.DivIcon {
  const key = `${status}:${selected}`;
  let found = icons.get(key);
  if (!found) {
    const size = selected ? 30 : 22;
    found = L.divIcon({
      className: `meter-icon${selected ? ' selected' : ''}`,
      html: statusSvg(status, size, selected ? 'selected' : 'surface'),
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
    icons.set(key, found);
  }
  return found;
}

interface Props {
  meters: Meter[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Changes when the map should re-fit to the meters, e.g. a new network node. */
  fitKey: string;
}

interface Nearby {
  point: L.LatLng;
  items: Meter[] | null;
  error: string | null;
}

export function MeterMap({ meters, selectedId, onSelect, fitKey }: Props) {
  const [picking, setPicking] = useState(false);
  const [radiusKm, setRadiusKm] = useState(1);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [basemap, setBasemap] = useStoredBasemap();

  const findNear = (point: L.LatLng, radius = radiusKm) => {
    setPicking(false);
    setNearby({ point, items: null, error: null });
    api<MeterPage>(`/meters?near=${point.lat.toFixed(5)},${point.lng.toFixed(5)}&radiusKm=${radius}&limit=100`).then(
      (page) => setNearby({ point, items: page.items, error: null }),
      (err: Error) => setNearby({ point, items: null, error: err.message }),
    );
  };

  // While picking a point, a click on a meter counts as that point: "what is near this meter?"
  const onMeterClick = (m: Meter) =>
    picking ? findNear(L.latLng(m.location.lat, m.location.lng)) : onSelect(m.id);
  const selected = meters.find((m) => m.id === selectedId);

  return (
    <section className="card map-card" aria-label="Map of meters">
      <div className={`map${picking ? ' picking' : ''}`} style={{ height: '100%' }}>
        <MapContainer center={JAIPUR} zoom={12} style={{ height: '100%' }} preferCanvas={false}>
          {basemap === 'map' ? (
            // The theme's filter comes from CSS (--tile-filter), so a theme change keeps the loaded tiles.
            <TileLayer key="map" url={OSM.url} attribution={OSM.attribution} maxZoom={19} className="tiles" />
          ) : (
            <>
              <TileLayer key="satellite" url={SATELLITE.url} attribution={SATELLITE.attribution} maxNativeZoom={18} maxZoom={19} />
              <TileLayer key="satellite-labels" url={SATELLITE.labels} maxNativeZoom={18} maxZoom={19} />
            </>
          )}
          <ClusteredMeters meters={meters} hidden={selectedId} onClick={onMeterClick} />
          {selected && (
            // The selected meter sits outside the groups, so it never disappears into a bubble.
            <Marker
              position={[selected.location.lat, selected.location.lng]}
              icon={icon(selected.status, true)}
              zIndexOffset={1000}
              eventHandlers={{ click: () => onMeterClick(selected) }}
              title={`${selected.id}, ${STATUS_LABEL[selected.status]}`}
            >
              <Tooltip className="meter-tip" direction="top" offset={[0, -12]}>
                <span className="mono">{selected.id}</span> · {STATUS_LABEL[selected.status]}
              </Tooltip>
            </Marker>
          )}
          {nearby && (
            <Circle
              center={nearby.point}
              radius={radiusKm * 1000}
              pathOptions={{ className: 'near-circle', weight: 1 }}
            />
          )}
          <FitTo meters={meters} fitKey={fitKey} />
          <TrackSize />
          <PanTo meter={selected} />
          <PickPoint active={picking} onPick={(p) => findNear(p)} />
        </MapContainer>
      </div>

      <div className="map-tools">
        <div className="segmented" role="radiogroup" aria-label="Map style">
          {(['map', 'satellite'] as const).map((b) => (
            <button key={b} role="radio" aria-checked={basemap === b} onClick={() => setBasemap(b)}>
              {b === 'map' ? 'Map' : 'Satellite'}
            </button>
          ))}
        </div>
        <button className={`ghost${picking ? ' active' : ''}`} onClick={() => setPicking((p) => !p)} aria-pressed={picking}>
          {picking ? 'Click the map…' : 'Find nearby'}
        </button>
        <label>
          <span className="muted">within </span>
          <OptionSelect
            size="sm"
            label="Search radius"
            value={String(radiusKm)}
            onChange={(v) => {
              const r = Number(v);
              setRadiusKm(r);
              if (nearby) findNear(nearby.point, r);
            }}
            options={[0.5, 1, 2, 5].map((r) => ({ value: String(r), label: `${r} km` }))}
          />
        </label>
      </div>

      {nearby && (
        <aside className="nearby" aria-live="polite">
          <header>
            {nearby.error
              ? nearby.error
              : nearby.items === null
                ? 'Searching…'
                : `${nearby.items.length} meters within ${radiusKm} km, nearest first`}
            <button className="close" style={{ float: 'right', fontSize: 18 }} onClick={() => setNearby(null)} aria-label="Close nearby list">
              ×
            </button>
          </header>
          {nearby.items && (
            <ol>
              {nearby.items.map((m) => (
                <li key={m.id}>
                  <button onClick={() => onSelect(m.id)}>
                    <StatusMark status={m.status} />
                    <span className="mono">{m.id}</span>
                    <span className="muted num">{fmt.whole((m.distanceKm ?? 0) * 1000)} m</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </aside>
      )}

      <div className="map-legend" aria-label="Legend">
        {STATUSES.map((s) => (
          <span key={s}>
            <StatusMark status={s} /> {STATUS_LABEL[s]}
          </span>
        ))}
        <span>
          <span className="legend-cluster" aria-hidden="true">
            12<b>3</b>
          </span>
          Group of meters (red: faulty)
        </span>
      </div>
    </section>
  );
}

/**
 * Meters close together on screen are drawn as one bubble with their count, and
 * a red badge for how many are faulty. Zooming in (or clicking a bubble) splits
 * them; from zoom 16 every meter is shown on its own.
 */
function ClusteredMeters({ meters, hidden, onClick }: { meters: Meter[]; hidden: string | null; onClick: (m: Meter) => void }) {
  const map = useMap();
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const group = useMemo(
    () =>
      L.markerClusterGroup({
        maxClusterRadius: 110,
        disableClusteringAtZoom: 16,
        // Split instantly: the plugin's own animation waits on CSS transitions,
        // which never finish in a background tab and can leave a group stuck.
        animate: false,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: false,
        iconCreateFunction: clusterIcon,
      }),
    [],
  );

  useEffect(() => {
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
    };
  }, [map, group]);

  useEffect(() => {
    group.clearLayers();
    group.addLayers(
      meters
        .filter((m) => m.id !== hidden)
        .map((m) => {
          const marker = L.marker([m.location.lat, m.location.lng], {
            icon: icon(m.status, false),
            title: `${m.id}, ${STATUS_LABEL[m.status]}`,
            zIndexOffset: m.status === 'faulty' ? 100 : 0,
          });
          // textContent, not HTML: these strings come from the API.
          const tip = document.createElement('span');
          tip.textContent = `${m.id} · ${STATUS_LABEL[m.status]} · ${m.hierarchy.transformer.code}`;
          marker.bindTooltip(tip, { className: 'meter-tip', direction: 'top', offset: [0, -8] });
          marker.on('click', () => clickRef.current(m));
          statusOf.set(marker, m.status);
          return marker;
        }),
    );
  }, [group, meters, hidden]);

  return null;
}

const statusOf = new WeakMap<L.Marker, Status>();

function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const counts: Record<Status, number> = { installed: 0, faulty: 0, decommissioned: 0 };
  for (const marker of cluster.getAllChildMarkers()) counts[statusOf.get(marker) ?? 'installed']++;
  const n = cluster.getChildCount();
  const size = n < 10 ? 34 : n < 50 ? 40 : 46;
  const title = `${n} meters: ${counts.installed} installed, ${counts.faulty} faulty, ${counts.decommissioned} decommissioned. Click to zoom in.`;
  return L.divIcon({
    className: 'cluster-icon',
    html:
      `<div class="cluster" title="${title}" style="width:${size}px;height:${size}px">${n}` +
      (counts.faulty ? `<b class="cluster-faulty">${counts.faulty}</b>` : '') +
      `</div>`,
    iconSize: [size, size],
  });
}

/** The chosen basemap, remembered in this browser. Storage can be refused (private windows), so it is optional. */
function useStoredBasemap() {
  const [basemap, setBasemap] = useState<Basemap>(() => {
    try {
      return localStorage.getItem('basemap') === 'satellite' ? 'satellite' : 'map';
    } catch {
      return 'map';
    }
  });
  const choose = (b: Basemap) => {
    setBasemap(b);
    try {
      localStorage.setItem('basemap', b);
    } catch {
      // Not remembered; it still switches.
    }
  };
  return [basemap, choose] as const;
}

function FitTo({ meters, fitKey }: { meters: Meter[]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (meters.length === 0) return;
    const bounds = L.latLngBounds(meters.map((m) => [m.location.lat, m.location.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    // Re-fit only when the node changes, not when a status filter thins the markers.
  }, [fitKey, meters.length > 0]);
  return null;
}

/** Leaflet does not notice when its box changes size (the meter panel opening, a window resize), so tell it. */
function TrackSize() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function PanTo({ meter }: { meter: Meter | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!meter) return;
    // Opening the panel may have just narrowed the map; measure before deciding whether to pan.
    map.invalidateSize();
    const at = L.latLng(meter.location.lat, meter.location.lng);
    if (!map.getBounds().pad(-0.15).contains(at)) map.panTo(at);
  }, [meter, map]);
  return null;
}

function PickPoint({ active, onPick }: { active: boolean; onPick: (p: L.LatLng) => void }) {
  useMapEvents({ click: (e) => active && onPick(e.latlng) });
  return null;
}
