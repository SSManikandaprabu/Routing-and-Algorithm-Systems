const API_BASE = "/api";
let map, network;
let cityCoords = {};
let graphData = { nodes: [], edges: [] };
let routeLayer = null;
let currentAnimationId = 0;

document.addEventListener("DOMContentLoaded", async () => {
    initMap();
    await fetchGraphData();
    setupEventListeners();
});

function initMap() {
    map = L.map('mapContainer').setView([11.5, 78.5], 7);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { 
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map); 
}

function initGraph() {
    const container = document.getElementById('graphContainer');
    const nodesDataSet = new vis.DataSet(graphData.nodes.map(n => ({id: n.id, label: n.label, value: n.value})));
    const data = {
        nodes: nodesDataSet, 
        edges: new vis.DataSet(graphData.edges.map(e => ({ from: e.from, to: e.to, label: e.label, color: '#555', font: {color: '#aaa', align: 'top'} })))
    };
    const options = { 
        autoResize: true, 
        nodes: {shape: 'dot', scaling: {min: 20, max: 50, label: { enabled: true, min: 14, max: 30 } }, font: { color: '#ffffff', size: 14, strokeWidth: 0 },borderWidth: 2, color: {border: '#00E5FF', background: '#121212', highlight: { border: '#FFFFFF', background: '#00E5FF' }, hover: { border: '#FFFFFF', background: '#00E5FF' }}}, 
        edges: {width: 1, color: { color: '#555', highlight: '#FF3333', hover: '#00E5FF' }, font: { color: '#aaa', align: 'top', strokeWidth: 0 }, smooth: { type: 'dynamic' }}, 
        physics:{enabled: true,forceAtlas2Based: { gravitationalConstant: -50, centralGravity: 0.01, springConstant: 0.08, springLength: 200, avoidOverlap: 1 }, solver: 'forceAtlas2Based', stabilization: { iterations: 1000 }},
        interaction: { hover: true,dragNodes: true,dragView: true, zoomView: true }
    };
    network = new vis.Network(container, data, options); 
    network.on("stabilizationIterationsDone", function () {
        network.fit({ 
            animation: {
                duration: 1000,
                easingFunction: "easeInOutQuad" 
            }
        });
    });
}

async function fetchGraphData() {
    try {
        const response = await fetch(`${API_BASE}/graph`); 
        const data = await response.json();

        cityCoords = data.cities; 
        graphData.nodes = data.nodes; 
        graphData.edges = data.edges; 
        const nodeDegrees = {};
        graphData.nodes.forEach(node => nodeDegrees[node.id] = 0); 
        graphData.edges.forEach(edge => {
            nodeDegrees[edge.from]++; 
            nodeDegrees[edge.to]++; 
        });
        graphData.nodes.forEach(node => { node.value = nodeDegrees[node.id]; }); 
        
        const sourceSel = document.getElementById('sourceSelect');
        const targetSel = document.getElementById('targetSelect');
        Object.keys(cityCoords).forEach(city => { 
            sourceSel.add(new Option(city, city)); 
            targetSel.add(new Option(city, city));
        }); 
        targetSel.selectedIndex = 1; 
        Object.keys(cityCoords).forEach(city => {
            L.marker(cityCoords[city]).addTo(map).bindPopup(city);
        }); 
        initGraph();
    } catch (err) {
        console.error("Error fetching graph data:", err); 
    }
}

function setupEventListeners() {
    document.getElementById('btnMap').onclick = () => switchView('mapContainer', 'btnMap'); 
    document.getElementById('btnGraph').onclick = () => switchView('graphContainer', 'btnGraph'); 
    document.getElementById('btnResetView').onclick = () => {
        if (network) { 
            network.fit({
                animation: { 
                    duration: 1000,
                    easingFunction: "easeInOutQuad" 
                }
            });
        }
    }; 
    document.getElementById('findRouteBtn').onclick = async () => {
        const source = document.getElementById('sourceSelect').value; 
        const target = document.getElementById('targetSelect').value; 
        const mode = document.getElementById('modeSelect').value; 
        const algo = document.getElementById('algoSelect').value;
        if (source === target) {
            alert("Source and Destination cannot be the same!"); 
            return;
        }
        document.getElementById('spinner').classList.remove('hidden'); 
        await computeRoute(source, target, mode, algo); 
        document.getElementById('spinner').classList.add('hidden');
    };
}

function switchView(viewId, btnId) {
    document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active')); 
    document.querySelectorAll('.view-toggles button').forEach(el => el.classList.remove('active')); 
    document.getElementById(viewId).classList.add('active'); 
    document.getElementById(btnId).classList.add('active');
    if (viewId === 'graphContainer') {
        document.getElementById('btnResetView').style.display = 'block'; 
        if (network) {
            setTimeout(() => network.fit(), 10);
        }
    } else {
        document.getElementById('btnResetView').style.display = 'none'; 
        if (viewId === 'mapContainer' && map) {
            setTimeout(() => map.invalidateSize(), 10);
        }
    }
}

async function computeRoute(source, target, mode, selectedAlgo) { 
    try {
        const response = await fetch(`${API_BASE}/compute`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ source, target, mode })
        });
        const results = await response.json(); 
        if (results.error) { 
            alert(results.error);
            return;
        } 
        updateOutputPanel(results, selectedAlgo); 
        const path = results[selectedAlgo].path;
        const visited = results[selectedAlgo].visited;
        const speed = parseInt(document.getElementById('speedSelect').value); 
        drawMapRoute(path);
        animateGraphTraversal(path, visited, speed);
    } catch (err) {
        console.error("Computation error:", err); 
    }
}

function updateOutputPanel(results, selectedAlgo) {
    document.getElementById('resultsPanel').classList.remove('hidden'); 
    document.getElementById('outDist').innerText = results[selectedAlgo].distance; 
    document.getElementById('outTime').innerText = results[selectedAlgo].time; 
    document.getElementById('outStops').innerText = results[selectedAlgo].stops; 
    const tbody = document.getElementById('compareBody');
    tbody.innerHTML = ''; 
    Object.keys(results).forEach(algo => { 
        const row = document.createElement('tr');
        if (algo === selectedAlgo) row.classList.add('highlight'); 
        row.innerHTML = `
            <td>${algo}</td>
            <td>${results[algo].distance}</td>
            <td>${results[algo].time}</td>
            <td>${results[algo].stops}</td>`; 
        tbody.appendChild(row);
    });
}

function drawMapRoute(path) {
    if (routeLayer) map.removeLayer(routeLayer); 
    const latlngs = path.map(city => cityCoords[city]);
    routeLayer = L.polyline(latlngs, {color: '#FF3333', weight: 6, opacity: 0.8}).addTo(map); 
    map.flyToBounds(routeLayer.getBounds(), { padding: [100, 100], duration: 1.5 });
}

async function animateGraphTraversal(path, visited, speed) {
    currentAnimationId++;
    const animId = currentAnimationId;
    const nodes = network.body.data.nodes; 
    const edges = network.body.data.edges;
    nodes.getIds().forEach(id => nodes.update({id: id, color: { border: '#00E5FF', background: '#121212' }})); 
    edges.forEach(e => edges.update({id: e.id, color: '#555', width: 1}));
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)); 
    for (let node of visited) {
        if (animId !== currentAnimationId) return; 
        nodes.update({id: node, color: '#FFD700'}); 
        await sleep(speed);
    }
    nodes.getIds().forEach(id => nodes.update({id: id, color: { border: '#00E5FF', background: '#121212' }})); 
    await sleep(300);
    for (let i = 0; i < path.length; i++) {
        if (animId !== currentAnimationId) return;
        nodes.update({id: path[i], color: { border: '#FF3333', background: '#FF3333' }}); 
        if (i > 0) {
            const connectedEdges = network.getConnectedEdges(path[i]); 
            connectedEdges.forEach(edgeId => {
                const edge = edges.get(edgeId);
                if ((edge.from === path[i-1] && edge.to === path[i]) || (edge.to === path[i-1] && edge.from === path[i])) {
                    edges.update({id: edgeId, color: { color: '#FF3333' }, width: 4});
                }
            }); 
        }
        await sleep(speed);
    }
}
