'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type L from 'leaflet';

const FLIGHTS = [
  { id: 'vuelo_001', name: 'Norte Oeste · 106 Ha' },
  { id: 'vuelo_002', name: 'Oeste Extremo · 112 Ha' },
  { id: 'vuelo_006', name: 'Norte Pico · 126 Ha' },
  { id: 'vuelo_007', name: 'Norte Centro · 137 Ha' },
  { id: 'vuelo_009', name: 'Centro · 105 Ha' },
  { id: 'vuelo_011', name: 'Centro Sur · 104 Ha' },
  { id: 'vuelo_014', name: 'Oeste Medio Norte · 120 Ha' },
  { id: 'vuelo_015', name: 'Sur Oeste · 104 Ha' },
  { id: 'vuelo_016', name: 'Centro Sur K · 130 Ha' },
  { id: 'vuelo_017', name: 'Centro J · 109 Ha' },
  { id: 'vuelo_018', name: 'Centro Este Norte · 126 Ha' },
  { id: 'vuelo_020', name: 'Centro Este Sur · 123 Ha' },
  { id: 'vuelo_022', name: 'Este Norte Izq · 108 Ha' },
  { id: 'vuelo_024', name: 'Este Sur · 110 Ha' },
  { id: 'vuelo_025', name: 'Este Norte · 100 Ha' },
  { id: 'vuelo_f', name: 'Sur Oeste Medio · 87 Ha' },
];

const TILE_BASE_URL = 'https://storage.googleapis.com/dlos-ai-processed/tiles';
const FARM_CENTER: [number, number] = [39.928, -5.653];

const DEG2RAD = Math.PI / 180;
const EARTH_RADIUS = 6371000;

function haversineDistance(c1: number[], c2: number[]): number {
  const lat1 = c1[1] * DEG2RAD, lat2 = c2[1] * DEG2RAD;
  const dlat = (c2[1] - c1[1]) * DEG2RAD;
  const dlng = (c2[0] - c1[0]) * DEG2RAD;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlng / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function geodesicRingArea(ring: number[][]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lng1 = ring[i][0] * DEG2RAD, lat1 = ring[i][1] * DEG2RAD;
    const lng2 = ring[j][0] * DEG2RAD, lat2 = ring[j][1] * DEG2RAD;
    total += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs(total * EARTH_RADIUS * EARTH_RADIUS / 2);
}

function ringPerimeter(ring: number[][]): number {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    total += haversineDistance(ring[i], ring[i + 1]);
  }
  return total;
}

function computeArea(geometry: { type: string; coordinates: number[][][][] | number[][][] }): number {
  if (geometry.type === 'MultiPolygon') {
    const coords = geometry.coordinates as number[][][][];
    let total = 0;
    for (const polygon of coords) {
      total += geodesicRingArea(polygon[0]);
      for (let h = 1; h < polygon.length; h++) total -= geodesicRingArea(polygon[h]);
    }
    return total;
  }
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates as number[][][];
    let total = geodesicRingArea(coords[0]);
    for (let h = 1; h < coords.length; h++) total -= geodesicRingArea(coords[h]);
    return total;
  }
  return 0;
}

function computePerimeter(geometry: { type: string; coordinates: number[][][][] | number[][][] }): number {
  if (geometry.type === 'MultiPolygon') {
    const coords = geometry.coordinates as number[][][][];
    let total = 0;
    for (const polygon of coords) {
      for (const ring of polygon) total += ringPerimeter(ring);
    }
    return total;
  }
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates as number[][][];
    let total = 0;
    for (const ring of coords) total += ringPerimeter(ring);
    return total;
  }
  return 0;
}

function computeCentroid(geometry: { type: string; coordinates: number[][][][] | number[][][] }): [number, number] {
  let ring: number[][];
  if (geometry.type === 'MultiPolygon') {
    ring = (geometry.coordinates as number[][][][])[0][0];
  } else {
    ring = (geometry.coordinates as number[][][])[0];
  }
  let latSum = 0, lngSum = 0;
  for (const c of ring) { lngSum += c[0]; latSum += c[1]; }
  return [latSum / ring.length, lngSum / ring.length];
}

function formatArea(m2: number): string {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(2)} ha`;
  return `${m2.toFixed(1)} m²`;
}

function formatLength(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${m.toFixed(1)} m`;
}

function formatVolume(m3: number): string {
  if (m3 >= 1000) return `${(m3 / 1000).toFixed(1)} mil m³`;
  return `${m3.toFixed(1)} m³`;
}

export default function MapaTab() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerRefs = useRef<Record<string, L.TileLayer>>({});
  const geojsonRef = useRef<L.GeoJSON | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const sateliteRef = useRef<L.TileLayer | null>(null);

  const [prueba11Active, setPrueba11Active] = useState(false);
  const [pinsActive, setPinsActive] = useState(false);
  const [sateliteActive, setSateliteActive] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [activeFlights, setActiveFlights] = useState<Record<string, boolean>>(() => {
    return Object.fromEntries(FLIGHTS.map(f => [f.id, false])); // ninguno activo por defecto
  });

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    import('leaflet').then((leaflet) => {
      const Leaf = leaflet.default;
      if (!mapRef.current || mapInstance.current) return;

      const map = Leaf.map(mapRef.current, {
        center: FARM_CENTER,
        zoom: 16,
        zoomControl: false,
        maxZoom: 22,
        minZoom: 0,
        preferCanvas: true,
      });

      mapInstance.current = map;
      Leaf.control.zoom({ position: 'topright' }).addTo(map);

      const sateliteLayer = Leaf.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 22, maxNativeZoom: 18, attribution: 'Esri', updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 2 }
      );
      sateliteRef.current = sateliteLayer;

      const fincaCoords: [number, number][] = [
        [-5.56633698854812,39.89483210714662],[-5.584784303656601,39.89553112408471],
        [-5.598807958394552,39.896051080854],[-5.628200514177362,39.89734588684639],
        [-5.637111893376323,39.89767152124086],[-5.643085260394832,39.89790963425344],
        [-5.647191051702332,39.90143622229412],[-5.649092107820618,39.90449807589249],
        [-5.650950035719637,39.90618662416114],[-5.655158295846787,39.91006146831354],
        [-5.655979139011267,39.91141508100612],[-5.654093823710081,39.91509986212073],
        [-5.653073513871344,39.91608295142061],[-5.649708075561821,39.91852686987795],
        [-5.647676235348412,39.91982080843769],[-5.64581643831019,39.92194733081002],
        [-5.643179280698195,39.92589559860449],[-5.637935112853809,39.92280439588114],
        [-5.63349336053254,39.92054581524072],[-5.633424543549318,39.91992081680765],
        [-5.633894517778142,39.91910516482792],[-5.635094821762008,39.91858650885442],
        [-5.635632335018982,39.91814002086377],[-5.636046713399451,39.91698759152643],
        [-5.63633943076105,39.91621959711271],[-5.636629588898227,39.91521592293829],
        [-5.637109924399262,39.91442266662323],[-5.622283948363113,39.90862731880526],
        [-5.619401213472345,39.91279148050007],[-5.616190076470694,39.91669402178174],
        [-5.615607075758907,39.91814518391813],[-5.615977672745416,39.920186889012],
        [-5.616602660570549,39.92241771864418],[-5.617451821514959,39.9252810163772],
        [-5.617793895980842,39.92892790089837],[-5.6189046442437,39.93167118739866],
        [-5.619584325121629,39.93341588198256],[-5.619738433776616,39.93385630753367],
        [-5.620066219148711,39.93404682586683],[-5.620397746622205,39.93438233830507],
        [-5.620048573447331,39.93510892109912],[-5.619617496576772,39.93518200949707],
        [-5.618855159720581,39.93607493081569],[-5.618009845984631,39.93644717088844],
        [-5.61643238530683,39.93733320434688],[-5.614577216787765,39.93432952023062],
        [-5.61236429628904,39.9305372580061],[-5.610197759491774,39.9296214317453],
        [-5.608230446148752,39.92735001595513],[-5.607745317756584,39.92575611642423],
        [-5.607120892839092,39.92510612820313],[-5.606187769489082,39.92411218978955],
        [-5.605371949402347,39.92317822459429],[-5.60465504981781,39.92278059588448],
        [-5.603894181207214,39.92261751919116],[-5.603296686632278,39.92264066618027],
        [-5.602645033312732,39.92255119582302],[-5.602125256262871,39.92258333006858],
        [-5.601770022797727,39.92261514741082],[-5.601362743414718,39.92261873710237],
        [-5.601056716809392,39.92258672302641],[-5.600536251359074,39.92249967666194],
        [-5.59998029463074,39.92237936079664],[-5.599618290815246,39.92209435898577],
        [-5.598725208860706,39.9216251155325],[-5.598069967622329,39.92113565575021],
        [-5.597331328962922,39.92100040726285],[-5.59684360141945,39.92109522647708],
        [-5.596451112034277,39.9210228072939],[-5.595981828981,39.92067228915003],
        [-5.595860832417442,39.92003047090722],[-5.595848661713458,39.91952251765827],
        [-5.595709534961858,39.91904991959289],[-5.595157337447214,39.9188010453055],
        [-5.594432073364773,39.9186910471339],[-5.594089003536958,39.91872350958027],
        [-5.593510514756918,39.91836353737436],[-5.593048084666099,39.91813749888797],
        [-5.592370257340611,39.91812140174174],[-5.59195019627405,39.91793820969875],
        [-5.591479593654746,39.91781199546291],[-5.591038277019321,39.91765247547447],
        [-5.590496373830579,39.91748215642809],[-5.590102327736115,39.9175798877573],
        [-5.589612570576787,39.91744655809853],[-5.589179148603246,39.91710330567812],
        [-5.588858226372056,39.9169648608068],[-5.588142092918718,39.91693175383678],
        [-5.58763355760469,39.91656363186366],[-5.587121799818801,39.91661817258149],
        [-5.586470849836925,39.91666889928793],[-5.58599706920225,39.91671912345896],
        [-5.585655227620609,39.91653847879435],[-5.585425296302773,39.91629922343147],
        [-5.584975147440757,39.91600118794079],[-5.584666997114281,39.91550474221026],
        [-5.584251867215645,39.91528170917906],[-5.583728911464232,39.91534295202806],
        [-5.583460722622977,39.91529786746241],[-5.583354206848876,39.91503625273197],
        [-5.583364230328712,39.91481422801293],[-5.583283710181792,39.91460213691848],
        [-5.583058474990494,39.91448009831705],[-5.582786558219174,39.91439327849437],
        [-5.582465968122875,39.91437612812327],[-5.582106486601075,39.91436531549233],
        [-5.581770457841737,39.91431213763814],[-5.581475237563954,39.91426670861247],
        [-5.581163169462973,39.91432540491613],[-5.580964536535537,39.91433011650001],
        [-5.580743408346497,39.91423994648706],[-5.580511129025999,39.91403836407736],
        [-5.580319806781612,39.91381721767386],[-5.580171481575444,39.91376204084791],
        [-5.579878255848785,39.91386008776351],[-5.579505896613439,39.9139347078702],
        [-5.579266236727912,39.91395067978694],[-5.579014039546394,39.91385369017577],
        [-5.578743710477544,39.91377518788428],[-5.578489059747761,39.91371441142923],
        [-5.578299919581601,39.91376486312974],[-5.578092492512581,39.91393755683605],
        [-5.577964703455715,39.91406064652724],[-5.577791976217842,39.91401865110024],
        [-5.577680110043928,39.91385514302898],[-5.577623211247174,39.91363861420055],
        [-5.577573026240573,39.91333185356887],[-5.577474901522762,39.91284220580378],
        [-5.577266940738379,39.91247627189019],[-5.576962560725795,39.91242200847371],
        [-5.576624331885279,39.91257617596212],[-5.576329291406321,39.91292347253233],
        [-5.576040909531691,39.91284475330788],[-5.575747425607228,39.91230140760252],
        [-5.575629994984102,39.91202404334947],[-5.575342500828731,39.91170208378983],
        [-5.574930876267205,39.91172014162387],[-5.574546485299838,39.91184218880318],
        [-5.574123969377309,39.91195099236269],[-5.573613027435584,39.91175634431458],
        [-5.573377197636274,39.91147925884704],[-5.573016684442327,39.91132649590117],
        [-5.572523867348064,39.91146960694276],[-5.572433447571747,39.9115084125344],
        [-5.572247387876517,39.91128634221194],[-5.572223584957331,39.91083319308666],
        [-5.571808206839789,39.91072320696183],[-5.571583376946096,39.91068586307301],
        [-5.571325250566506,39.91048822843014],[-5.571054994601399,39.9103564261932],
        [-5.570807649612268,39.91007872277346],[-5.5704125599276,39.90995206756553],
        [-5.569944106303248,39.90990715560184],[-5.569654179240721,39.91010981416817],
        [-5.569662115645484,39.91058178776005],[-5.569559683992964,39.91104666666217],
        [-5.569169993265957,39.9111169037108],[-5.568608302508011,39.9109535587825],
        [-5.568196062516249,39.91082235599698],[-5.567956102768487,39.91056370079204],
        [-5.568078398830264,39.91021343298133],[-5.567942661707872,39.90994298954058],
        [-5.567585786590435,39.9098373989977],[-5.567266215288283,39.90973917546346],
        [-5.566920166693165,39.90962262746816],[-5.566746004765395,39.90978007277285],
        [-5.566589470262505,39.91009480132109],[-5.566382323419217,39.9100971957325],
        [-5.566083898322373,39.90999501855478],[-5.565646260987362,39.90975331364175],
        [-5.565293744058234,39.90950621669862],[-5.565013220313241,39.90937818461332],
        [-5.564772106122877,39.90937034033316],[-5.56452755506927,39.90939893190766],
        [-5.564260377043636,39.9093977405628],[-5.563880984460376,39.90926295400876],
        [-5.563448512014592,39.90917105015838],[-5.563092246113442,39.90912761491705],
        [-5.562633951842009,39.90913611493222],[-5.562407361382194,39.90848937438163],
        [-5.562240738895396,39.9079904512182],[-5.561841581744393,39.90714897292334],
        [-5.561514365751233,39.90634879499801],[-5.56125874279487,39.90546679046244],
        [-5.561259952859588,39.90462258153385],[-5.561301058838659,39.90356276630901],
        [-5.561402815263305,39.9023197849283],[-5.561493317457025,39.90061274907264],
        [-5.562175438721257,39.90055767800452],[-5.563137127398969,39.90072484710804],
        [-5.563721721687757,39.90104039243754],[-5.564193173531111,39.90133451934941],
        [-5.564447682961761,39.9016134395658],[-5.565119723848851,39.9017087881269],
        [-5.565747998704373,39.90164847424009],[-5.56613683407984,39.90151997734988],
        [-5.566331037812635,39.90106693818872],[-5.566282512612418,39.900355403361],
        [-5.566039254986324,39.89981697708359],[-5.565886315498431,39.89931413056608],
        [-5.565655537967135,39.89885121696852],[-5.565413066548603,39.89847106564517],
        [-5.565674037959274,39.89797772342453],[-5.56596388756644,39.89742458623675],
        [-5.566085745361894,39.89689918076192],[-5.566205166409265,39.8963453809214],
        [-5.56629160298659,39.8960199134696],[-5.56633698854812,39.89483210714662],
      ];

      const fincaLatLngs = fincaCoords.map(([lng, lat]) => [lat, lng] as [number, number]);
      const fincaPoly = Leaf.polygon(fincaLatLngs, {
        color: '#22c55e', weight: 3, opacity: 1,
        fillColor: '#22c55e', fillOpacity: 0.05,
      }).addTo(map);

      map.fitBounds(fincaPoly.getBounds(), { padding: [30, 30] });

      FLIGHTS.forEach((flight) => {
        const layer = Leaf.tileLayer(
          `${TILE_BASE_URL}/${flight.id}/{z}/{x}/{y}.png`,
          { maxZoom: 22, maxNativeZoom: 20, minNativeZoom: 16, minZoom: 0, tms: false, opacity: 1, updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 2, errorTileUrl: '' }
        );
        layerRefs.current[flight.id] = layer;
        // No se añaden al mapa por defecto — el usuario activa cada una
      });

      const waterMarkers = Leaf.layerGroup();
      markersRef.current = waterMarkers;

      const CLASS_STYLES: Record<string, { color: string; fill: string; icon: string; label: string; depth: number }> = {
        'Rio':           { color: '#1d4ed8', fill: '#3b82f6', icon: 'water',      label: 'Río',           depth: 1.5 },
        'Charca grande': { color: '#0e7490', fill: '#06b6d4', icon: 'water_drop', label: 'Charca grande', depth: 1.2 },
      };

      fetch('/OKK.geojson')
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(data => {
          interface FeatureInfo { idx: number; lat: number; lng: number; area: number; perimeter: number; clase: string | null; }
          const infos: FeatureInfo[] = data.features.map((f: { properties?: { clase?: string }; geometry: { type: string; coordinates: number[][][][] | number[][][] } }, i: number) => {
            const geom = f.geometry;
            const [lat, lng] = computeCentroid(geom);
            return { idx: i, lat, lng, area: computeArea(geom), perimeter: computePerimeter(geom), clase: f.properties?.clase || null };
          });

          const CLUSTER_DIST = 30;
          const parent = infos.map((_, i) => i);
          function find(x: number): number { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
          function union(a: number, b: number) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }

          const cellSize = CLUSTER_DIST / 111320;
          const grid: Record<string, number[]> = {};
          for (let i = 0; i < infos.length; i++) {
            const gx = Math.floor(infos[i].lng / cellSize);
            const gy = Math.floor(infos[i].lat / cellSize);
            const key = `${gx},${gy}`;
            if (!grid[key]) grid[key] = [];
            grid[key].push(i);
          }
          for (const key of Object.keys(grid)) {
            const [gxs, gys] = key.split(',');
            const gx = parseInt(gxs), gy = parseInt(gys);
            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                const nk = `${gx + dx},${gy + dy}`;
                if (!grid[nk]) continue;
                for (const i of grid[key]) {
                  for (const j of grid[nk]) {
                    if (i >= j) continue;
                    if (haversineDistance([infos[i].lng, infos[i].lat], [infos[j].lng, infos[j].lat]) < CLUSTER_DIST) union(i, j);
                  }
                }
              }
            }
          }

          const clusters: Record<number, FeatureInfo[]> = {};
          for (let i = 0; i < infos.length; i++) { const root = find(i); if (!clusters[root]) clusters[root] = []; clusters[root].push(infos[i]); }

          const gjLayer = Leaf.geoJSON(data, {
            style: (feature) => {
              const s = CLASS_STYLES[feature?.properties?.clase] || CLASS_STYLES['Charca grande'];
              return { color: s.color, weight: 2, opacity: 0.9, fillColor: s.fill, fillOpacity: 0.45 };
            },
            onEachFeature: (feature, layer) => {
              const geom = feature.geometry as { type: string; coordinates: number[][][][] | number[][][] };
              const clase = feature.properties?.clase || 'Charca grande';
              const s = CLASS_STYLES[clase] || CLASS_STYLES['Charca grande'];
              const area = feature.properties?.area_m2 || computeArea(geom);
              const perim = computePerimeter(geom);
              const volume = area * s.depth;
              const [lat, lng] = computeCentroid(geom);
              const gmapsUrl = `https://www.google.com/maps?q=${lat.toFixed(7)},${lng.toFixed(7)}`;
              layer.bindPopup(`<div style="font-family:system-ui;min-width:200px;"><div style="font-weight:700;font-size:14px;margin-bottom:8px;color:#0f172a;display:flex;align-items:center;gap:6px;"><span class="material-icons-round" style="font-size:18px;color:${s.color}">${s.icon}</span>${s.label}</div><table style="width:100%;font-size:12px;border-collapse:collapse;"><tr><td style="padding:3px 8px 3px 0;color:#64748b;">Área</td><td style="font-weight:600;color:#0f172a;">${formatArea(area)}</td></tr><tr><td style="padding:3px 8px 3px 0;color:#64748b;">Perímetro</td><td style="font-weight:600;color:#0f172a;">${formatLength(perim)}</td></tr><tr><td style="padding:3px 8px 3px 0;color:#64748b;">Vol. estimado</td><td style="font-weight:600;color:#0f172a;">${formatVolume(volume)}</td></tr></table><a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:4px;margin-top:8px;padding:6px 10px;background:#22c55e;color:white;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;justify-content:center;"><span class="material-icons-round" style="font-size:16px;">location_on</span>Ir a ubicación</a></div>`, { maxWidth: 280 });
            },
          });
          geojsonRef.current = gjLayer;
          if (prueba11Active) {
            gjLayer.addTo(map);
          }

          for (const members of Object.values(clusters)) {
            const totalArea = members.reduce((s, m) => s + m.area, 0);
            const totalPerimeter = members.reduce((s, m) => s + m.perimeter, 0);
            const cLat = members.reduce((s, m) => s + m.lat, 0) / members.length;
            const cLng = members.reduce((s, m) => s + m.lng, 0) / members.length;
            const claseCounts: Record<string, number> = {};
            for (const m of members) { const c = m.clase || 'Charca grande'; claseCounts[c] = (claseCounts[c] || 0) + 1; }
            const dominantClase = Object.entries(claseCounts).sort((a, b) => b[1] - a[1])[0][0];
            const cs = CLASS_STYLES[dominantClase] || CLASS_STYLES['Charca grande'];
            const totalVolume = totalArea * cs.depth;
            const gmapsUrl = `https://www.google.com/maps?q=${cLat.toFixed(7)},${cLng.toFixed(7)}`;
            const countLabel = members.length > 1 ? `<span style="font-size:11px;color:#94a3b8;font-weight:400;"> (${members.length} partes)</span>` : '';
            const popupHtml = `<div style="font-family:system-ui;min-width:210px;"><div style="font-weight:700;font-size:14px;margin-bottom:8px;color:#0f172a;display:flex;align-items:center;gap:6px;"><span class="material-icons-round" style="font-size:18px;color:${cs.color}">${cs.icon}</span>${cs.label}${countLabel}</div><table style="width:100%;font-size:12px;border-collapse:collapse;"><tr><td style="padding:3px 8px 3px 0;color:#64748b;">Área total</td><td style="font-weight:600;color:#0f172a;">${formatArea(totalArea)}</td></tr><tr><td style="padding:3px 8px 3px 0;color:#64748b;">Perímetro total</td><td style="font-weight:600;color:#0f172a;">${formatLength(totalPerimeter)}</td></tr><tr><td style="padding:3px 8px 3px 0;color:#64748b;">Vol. estimado</td><td style="font-weight:600;color:#0f172a;">${formatVolume(totalVolume)}</td></tr></table><a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:4px;margin-top:8px;padding:6px 10px;background:#22c55e;color:white;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;justify-content:center;"><span class="material-icons-round" style="font-size:16px;">location_on</span>Ir a ubicación</a></div>`;
            const markerIcon = Leaf.divIcon({
              className: '',
              html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${cs.color};transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;cursor:pointer;"><span class="material-icons-round" style="font-size:14px;color:white;transform:rotate(45deg);">${cs.icon}</span></div>`,
              iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -28],
            });
            Leaf.marker([cLat, cLng], { icon: markerIcon }).bindPopup(popupHtml, { maxWidth: 280 }).addTo(waterMarkers);
          }
        })
        .catch(err => console.error('[MapaTab] GeoJSON error:', err));

      Leaf.control.scale({ position: 'bottomright', metric: true, imperial: false }).addTo(map);
      setTimeout(() => { map.invalidateSize(); map.fitBounds(fincaPoly.getBounds(), { padding: [30, 30] }); setMapReady(true); }, 200);
    });

    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, []);

  const toggleFlight = (flightId: string) => {
    const layer = layerRefs.current[flightId];
    if (!layer || !mapInstance.current) return;
    const nowActive = !activeFlights[flightId];
    if (nowActive) layer.addTo(mapInstance.current);
    else mapInstance.current.removeLayer(layer);
    setActiveFlights(prev => ({ ...prev, [flightId]: nowActive }));
  };

  const toggleAll = (visible: boolean) => {
    if (!mapInstance.current) return;
    FLIGHTS.forEach(flight => {
      const layer = layerRefs.current[flight.id];
      if (!layer) return;
      if (visible) layer.addTo(mapInstance.current!);
      else mapInstance.current!.removeLayer(layer);
    });
    setActiveFlights(Object.fromEntries(FLIGHTS.map(f => [f.id, visible])));
  };

  const toggleSatelite = () => {
    const layer = sateliteRef.current;
    if (!layer || !mapInstance.current) return;
    if (sateliteActive) mapInstance.current.removeLayer(layer);
    else layer.addTo(mapInstance.current);
    setSateliteActive(prev => !prev);
  };

  const togglePrueba11 = () => {
    const layer = geojsonRef.current;
    const markers = markersRef.current;
    if (!layer || !mapInstance.current) return;
    if (prueba11Active) {
      mapInstance.current.removeLayer(layer);
      if (markers) mapInstance.current.removeLayer(markers);
    } else {
      layer.addTo(mapInstance.current);
      if (markers && pinsActive) markers.addTo(mapInstance.current);
    }
    setPrueba11Active(prev => !prev);
  };

  const togglePins = () => {
    const markers = markersRef.current;
    if (!markers || !mapInstance.current) return;
    if (pinsActive) mapInstance.current.removeLayer(markers);
    else if (prueba11Active) markers.addTo(mapInstance.current);
    setPinsActive(prev => !prev);
  };

  // suppress unused warning
  void toggleAll; void togglePins;

  return (
    <div className="relative w-full" style={{ height: '100%' }}>
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {!mapReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400 text-sm">Cargando mapa...</p>
          </div>
        </div>
      )}

      {/* Layers panel */}
      <div className="absolute top-4 left-4 z-[1000]">
        <button onClick={() => setShowPanel(!showPanel)} className="bg-white rounded-xl shadow-lg border border-slate-200 p-3 flex items-center gap-2 hover:bg-slate-50 transition-all">
          <span className="material-icons-round text-xl text-slate-600">layers</span>
          <span className="text-sm font-semibold text-slate-700 hidden sm:inline">Capas</span>
        </button>
        {showPanel && (
          <div className="mt-2 bg-white rounded-2xl shadow-lg border border-slate-200 p-4 w-64 max-h-[60vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-slate-800">Capas</h3>
              <button onClick={() => setShowPanel(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round text-lg leading-none">close</span>
              </button>
            </div>
            <div className="space-y-1 mb-2">
              <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-all">
                <input type="checkbox" checked={sateliteActive} onChange={toggleSatelite} className="w-4 h-4 rounded accent-blue-500" />
                <span className="flex items-center gap-2 text-sm text-slate-700"><span className="inline-block w-3 h-3 rounded-sm bg-blue-400 opacity-80" />Google Earth</span>
              </label>
              <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-all">
                <input type="checkbox" checked={prueba11Active} onChange={togglePrueba11} className="w-4 h-4 rounded accent-cyan-500" />
                <span className="flex items-center gap-2 text-sm text-slate-700"><span className="inline-block w-3 h-3 rounded-sm bg-cyan-400 opacity-80" />Agua</span>
              </label>
            </div>
            <div className="border-t border-slate-100 pt-2">
              <h3 className="font-bold text-sm text-slate-800 mb-1 px-3">Vuelos</h3>
              <div className="space-y-1">
                {FLIGHTS.map((flight) => (
                  <label key={flight.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-all">
                    <input
                      type="checkbox"
                      checked={activeFlights[flight.id] ?? false}
                      onChange={() => toggleFlight(flight.id)}
                      className="w-4 h-4 rounded accent-primary"
                    />
                    <span className="text-sm text-slate-700">{flight.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-sm border border-slate-200 px-3 py-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#3b82f6' }} /><span className="text-xs text-slate-600">Río</span></div>
        <div className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#06b6d4' }} /><span className="text-xs text-slate-600">Charca grande</span></div>
        <div className="flex items-center gap-1.5 border-t border-slate-100 pt-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#22c55e' }} /><span className="text-xs text-slate-600">Linde finca Dehesa</span></div>
      </div>

      <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur rounded-xl px-3 py-2 text-xs text-slate-600 shadow-sm border border-slate-200">
        <span className="material-icons-round text-sm align-middle mr-1">location_on</span>
        Finca: {FARM_CENTER[0].toFixed(4)}, {FARM_CENTER[1].toFixed(4)}
      </div>
    </div>
  );
}
