"""
Knowledge Graph routes for JonathanOS (T-140)
Provides D3.js-compatible graph data from phoenix-graph entities/relationships.
"""
import json
import os
from collections import defaultdict
from flask import Blueprint, render_template, jsonify, request

graph_bp = Blueprint('graph', __name__)

# Paths to graph data
_GRAPH_DIR = os.path.join(os.path.dirname(__file__), '..', 'projects', 'phoenix-graph', 'graph')
_ENTITIES_PATH = os.path.join(_GRAPH_DIR, 'entities.json')
_RELATIONSHIPS_PATH = os.path.join(_GRAPH_DIR, 'relationships.json')

# Type → color mapping
TYPE_COLORS = {
    'Person':   '#4a9eff',   # blue
    'Company':  '#ff8c42',   # orange
    'Client':   '#ff6b6b',   # red-orange (clients are companies)
    'Concept':  '#a0a0b0',   # gray
    'Service':  '#7bc67e',   # green
    'Document': '#c8a0d4',   # purple
    'Project':  '#ffd166',   # yellow
    'Meeting':  '#78c8e0',   # teal
}
DEFAULT_COLOR = '#888888'

# For filter UI: broad categories
FILTER_MAP = {
    'people':    {'Person'},
    'companies': {'Company', 'Client'},
    'concepts':  {'Concept', 'Service', 'Project', 'Document', 'Meeting'},
}


def _load_graph_data():
    """Load and return (entities_list, relationships_list) from JSON files."""
    with open(_ENTITIES_PATH, 'r', encoding='utf-8') as f:
        entities = json.load(f)
    with open(_RELATIONSHIPS_PATH, 'r', encoding='utf-8') as f:
        relationships = json.load(f)
    return entities, relationships


def _normalize_relationships(entities, relationships):
    """
    Normalize relationships to use name strings (from/to) regardless of
    whether the data uses source_id/target_id integers or from/to strings.
    """
    # Build ID-to-name map
    id_to_name = {}
    for e in entities:
        eid = e.get('id')
        if eid is not None:
            id_to_name[eid] = e.get('name', '')

    normalized = []
    for rel in relationships:
        # Handle id-based format
        src_id = rel.get('source_id')
        tgt_id = rel.get('target_id')
        src_name = rel.get('from', '')
        tgt_name = rel.get('to', '')

        if src_id is not None and not src_name:
            src_name = id_to_name.get(src_id, '')
        if tgt_id is not None and not tgt_name:
            tgt_name = id_to_name.get(tgt_id, '')

        if src_name and tgt_name:
            normalized.append({
                'from': src_name,
                'to': tgt_name,
                'type': rel.get('type', rel.get('relationship_type', '')),
                'context': rel.get('context', ''),
            })
    return normalized


def _build_graph(filter_type=None, limit=200):
    """
    Build D3-compatible graph data.
    - filter_type: 'people' | 'companies' | 'concepts' | None (all)
    - limit: max nodes by degree
    Returns {nodes, links, meta}
    """
    entities, relationships = _load_graph_data()

    # Normalize relationships to name-based format
    relationships = _normalize_relationships(entities, relationships)

    # Index entities by name for fast lookup
    entity_by_name = {}
    entity_by_id = {}
    for e in entities:
        entity_by_name[e['name']] = e
        if e.get('id'):
            entity_by_id[e['id']] = e

    # Determine which types to include
    allowed_types = None
    if filter_type and filter_type in FILTER_MAP:
        allowed_types = FILTER_MAP[filter_type]

    # Filter entities by type
    if allowed_types:
        filtered_entities = [e for e in entities if e.get('type') in allowed_types]
    else:
        filtered_entities = entities

    filtered_names = {e['name'] for e in filtered_entities}

    # Count degrees (connections) for filtered entities
    degree = defaultdict(int)
    valid_rels = []
    for rel in relationships:
        src = rel.get('from', '')
        tgt = rel.get('to', '')
        if src in filtered_names and tgt in filtered_names:
            degree[src] += 1
            degree[tgt] += 1
            valid_rels.append(rel)

    # Sort by degree, take top `limit`
    sorted_entities = sorted(filtered_entities, key=lambda e: degree[e['name']], reverse=True)
    top_entities = sorted_entities[:limit]
    top_names = {e['name'] for e in top_entities}

    # Keep only edges where BOTH endpoints are in top set
    top_rels = [r for r in valid_rels if r.get('from') in top_names and r.get('to') in top_names]

    # Build node list
    nodes = []
    for e in top_entities:
        etype = e.get('type', 'Concept')
        deg = degree[e['name']]
        # Size: min 5, max 30, based on degree
        size = max(5, min(30, 5 + deg * 1.5))
        # Parse attributes if they're a JSON string
        attrs = e.get('attributes', {})
        if isinstance(attrs, str):
            try:
                attrs = json.loads(attrs)
            except Exception:
                attrs = {}
        nodes.append({
            'id':    e['name'],
            'label': e['name'],
            'type':  etype,
            'color': TYPE_COLORS.get(etype, DEFAULT_COLOR),
            'size':  round(size, 1),
            'degree': deg,
            'attributes': attrs,
        })

    # Build link list
    links = []
    seen_pairs = set()
    for rel in top_rels:
        src = rel.get('from', '')
        tgt = rel.get('to', '')
        # Deduplicate parallel edges
        pair = (src, tgt)
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        links.append({
            'source': src,
            'target': tgt,
            'label':  rel.get('type', ''),
        })

    return {
        'nodes': nodes,
        'links': links,
        'meta': {
            'total_entities':      len(entities),
            'total_relationships': len(relationships),
            'displayed_nodes':     len(nodes),
            'displayed_edges':     len(links),
            'filter':              filter_type or 'all',
        }
    }


def _build_search_graph(query, max_nodes=50):
    """
    Return matching nodes + their 1-hop neighborhood (max max_nodes total).
    """
    entities, relationships = _load_graph_data()
    # Normalize relationships to name-based format
    relationships = _normalize_relationships(entities, relationships)

    query_lower = query.lower().strip()

    if not query_lower:
        return {'nodes': [], 'links': [], 'meta': {'query': query, 'displayed_nodes': 0, 'displayed_edges': 0}}

    # Find matching entities
    matched = [e for e in entities if query_lower in e['name'].lower()]
    matched_names = {e['name'] for e in matched}

    # Find 1-hop neighbors
    neighbor_names = set()
    hop_rels = []
    for rel in relationships:
        src = rel.get('from', '')
        tgt = rel.get('to', '')
        if src in matched_names or tgt in matched_names:
            hop_rels.append(rel)
            if src in matched_names:
                neighbor_names.add(tgt)
            if tgt in matched_names:
                neighbor_names.add(src)

    # Combine matched + neighbors, capped at max_nodes
    all_names = matched_names | neighbor_names
    entity_map = {e['name']: e for e in entities}
    combined = [entity_map[n] for n in all_names if n in entity_map]
    combined = combined[:max_nodes]
    final_names = {e['name'] for e in combined}

    # Filter rels to final set
    final_rels = [r for r in hop_rels if r.get('from') in final_names and r.get('to') in final_names]

    # Compute degree within result set
    degree = defaultdict(int)
    for rel in final_rels:
        degree[rel.get('from', '')] += 1
        degree[rel.get('to', '')] += 1

    nodes = []
    for e in combined:
        etype = e.get('type', 'Concept')
        deg = degree[e['name']]
        size = max(5, min(30, 5 + deg * 1.5))
        attrs = e.get('attributes', {})
        if isinstance(attrs, str):
            try:
                attrs = json.loads(attrs)
            except Exception:
                attrs = {}
        nodes.append({
            'id':        e['name'],
            'label':     e['name'],
            'type':      etype,
            'color':     TYPE_COLORS.get(etype, DEFAULT_COLOR),
            'size':      round(size, 1),
            'degree':    deg,
            'matched':   e['name'] in matched_names,
            'attributes': attrs,
        })

    links = []
    seen_pairs = set()
    for rel in final_rels:
        src = rel.get('from', '')
        tgt = rel.get('to', '')
        pair = (src, tgt)
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        links.append({
            'source': src,
            'target': tgt,
            'label':  rel.get('type', ''),
        })

    return {
        'nodes': nodes,
        'links': links,
        'meta': {
            'query':           query,
            'matched_count':   len(matched_names),
            'displayed_nodes': len(nodes),
            'displayed_edges': len(links),
        }
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@graph_bp.route('/graph')
def graph_page():
    return render_template('graph.html')


@graph_bp.route('/api/knowledge-graph')
def api_knowledge_graph():
    """
    Returns D3-compatible graph data.
    Query params:
      type=people|companies|concepts  (filter by broad category)
      limit=<int>                     (max nodes, default 200)
    """
    filter_type = request.args.get('type', None)
    try:
        limit = int(request.args.get('limit', 200))
        limit = max(10, min(500, limit))
    except (ValueError, TypeError):
        limit = 200

    try:
        data = _build_graph(filter_type=filter_type, limit=limit)
        return jsonify(data)
    except FileNotFoundError as e:
        return jsonify({'error': f'Graph data not found: {e}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@graph_bp.route('/api/knowledge-graph/search')
def api_knowledge_graph_search():
    """
    Search for nodes by name and return their 1-hop neighborhood.
    Query params:
      q=<query string>
    """
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'error': 'Missing query parameter q'}), 400

    try:
        data = _build_search_graph(query, max_nodes=50)
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
