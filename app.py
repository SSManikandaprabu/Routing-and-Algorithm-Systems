import math
import webbrowser
import os
from threading import Timer
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import networkx as nx
from queue import PriorityQueue
from waitress import serve

# Get the directory where app.py is located
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
# Point the static folder to the same directory as app.py
app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')
CORS(app)

cities = {
# South India
"Chennai": (13.0827, 80.2707),
 
"Bengaluru": (12.9716, 77.5946),
"Hyderabad": (17.3850, 78.4867),
"Vijayawada": (16.5062, 80.6480),
"Visakhapatnam": (17.6868, 83.2185),
"Nellore": (14.4426, 79.9865),
"Coimbatore": (11.0168, 76.9558),
"Madurai": (9.9252, 78.1198),
"Kochi": (9.9312, 76.2673),
"Mysuru": (12.2958, 76.6394),
# North & Central India
"Delhi": (28.7041, 77.1025),
"Mumbai": (19.0760, 72.8777),
"Ahmedabad": (23.0225, 72.5714),
"Jaipur": (26.9124, 75.7873),
"Lucknow": (26.8467, 80.9462),
"Chandigarh": (30.7333, 76.7794),
"Kolkata": (22.5726, 88.3639),
"Nagpur": (21.1458, 79.0882) # Central Hub
}

G = nx.Graph()
for city, coords in cities.items():
    G.add_node(city, pos=coords)

edges = [
# South India Cluster
("Chennai", "Bengaluru", 350),
("Chennai", "Nellore", 175),
("Bengaluru", "Mysuru", 145),
("Hyderabad", "Bengaluru", 570),
("Bengaluru", "Coimbatore", 365),
("Coimbatore", "Madurai", 215),
("Coimbatore", "Kochi", 190),
("Hyderabad", "Vijayawada", 275),
("Vijayawada", "Nellore", 280),
("Vijayawada", "Visakhapatnam", 350),
# North India Cluster
("Delhi", "Jaipur", 280),
 
("Delhi", "Chandigarh", 250),
("Delhi", "Lucknow", 550),
("Jaipur", "Ahmedabad", 650),
("Ahmedabad", "Mumbai", 525),
("Lucknow", "Kolkata", 1000),
# Inter-Regional Connections
("Mumbai", "Hyderabad", 710),
("Mumbai", "Bengaluru", 980),
("Hyderabad", "Nagpur", 500),
("Bengaluru", "Nagpur", 1080),
("Nagpur", "Delhi", 1050),
("Nagpur", "Lucknow", 730),
("Nagpur", "Kolkata", 1120),
("Visakhapatnam", "Kolkata", 880),
("Delhi", "Ahmedabad", 940),
("Delhi", "Mumbai", 1400),
("Chennai", "Kolkata", 1670),
]
for u, v, w in edges:
    G.add_edge(u, v, weight=w)

def haversine(u, v):
    lat1, lon1 = G.nodes[u]['pos']
    lat2, lon2 = G.nodes[v]['pos']
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

@app.route('/api/graph', methods=['GET'])
def get_graph():
    nodes = [{"id": n, "label": n} for n in G.nodes]
    edges_data = [{"from": u, "to": v, "label": f"{d['weight']} km"} for u, v, d in G.edges(data=True)]
    return jsonify({"nodes": nodes, "edges": edges_data, "cities": cities})

@app.route('/api/compute', methods=['POST'])
def compute_route():
    data = request.json
    source = data.get('source')
    target = data.get('target')
    mode = data.get('mode', 'Car')
    speeds = {"Car": 70, "Bus": 50, "Train": 90, "Bike": 40}
    speed = speeds.get(mode, 70)
    results = {}

    def get_path_details(path, visited):
        dist = sum(G[path[i]][path[i+1]]['weight'] for i in range(len(path)-1))
        return {
            "path": path, "visited": visited, "distance": dist,
            "time": round(dist / speed, 2), "stops": len(path) - 2
        }

    def get_astar_visited(G, source, target, heuristic):
        visited = []
        pq = PriorityQueue()
        pq.put((0, source))
        cost_so_far = {source: 0}
        while not pq.empty():
            _, current = pq.get()
            if current not in visited:
                visited.append(current)
            if current == target:
                break
            for next_node in G.neighbors(current):
                new_cost = cost_so_far[current] + G[current][next_node]['weight']
                if next_node not in cost_so_far or new_cost < cost_so_far[next_node]:
                    cost_so_far[next_node] = new_cost
                    priority = new_cost + heuristic(next_node, target)
                    pq.put((priority, next_node))
        return visited

    try:
        p_dijkstra = nx.dijkstra_path(G, source, target, weight='weight')
        v_dijkstra = list(nx.single_source_dijkstra_path(G, source).keys())
        results["Dijkstra"] = get_path_details(p_dijkstra, v_dijkstra)
        
        p_astar = nx.astar_path(G, source, target, heuristic=haversine, weight='weight')
        v_astar = get_astar_visited(G, source, target, haversine)
        results["A*"] = get_path_details(p_astar, v_astar)
        
        p_bfs = nx.shortest_path(G, source, target)
        v_bfs = list(nx.bfs_tree(G, source).nodes())
        results["BFS"] = get_path_details(p_bfs, v_bfs)
    except nx.NetworkXNoPath:
        return jsonify({"error": "No path found between the selected cities."})
        
    return jsonify(results)

@app.route('/')
def serve_index():
    # Serves the index.html from the same folder as app.py
    return send_from_directory(BASE_DIR, 'index.html')

if __name__ == '__main__':
    print("Starting the Routing System server...")
    print("Opening your browser automatically to: http://127.0.0.1:5000/")
    
    # Wait 1.5 seconds for the server to start, then open the browser
    Timer(1.5, lambda: webbrowser.open_new("http://127.0.0.1:5000/")).start()
    
    # Run the app using Waitress (a production WSGI server)
    serve(app, host='0.0.0.0', port=5000)
