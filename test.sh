#!/bin/bash
# Test Mission Control v1

echo "🎯 Mission Control v1 Test Suite"
echo "================================="

# Test API endpoints
echo "1. Testing API response..."
response=$(curl -s -w "%{http_code}" http://localhost:8888/api/status)
http_code=${response: -3}
json_data=${response%???}

if [ "$http_code" = "200" ]; then
    echo "✅ API responding (HTTP 200)"
    
    # Parse key metrics
    bot_count=$(echo "$json_data" | jq '.bots | length')
    running_bots=$(echo "$json_data" | jq '.bots | map(select(.status == "running")) | length')
    total_pnl=$(echo "$json_data" | jq '.bots | map(.paper_pnl) | add')
    
    echo "✅ Bots: $running_bots/$bot_count running"
    echo "✅ Total Paper P&L: \$$(printf '%.2f' $total_pnl)"
    
    # Test system health
    uptime=$(echo "$json_data" | jq -r '.system.uptime')
    memory=$(echo "$json_data" | jq '.system.memory_percent')
    emma=$(echo "$json_data" | jq -r '.system.emma_status')
    
    echo "✅ System: $uptime uptime, ${memory}% memory, Emma: $emma"
    
else
    echo "❌ API failed (HTTP $http_code)"
    exit 1
fi

echo ""
echo "2. Testing data sources..."

# Check if files exist
test_files=(
    "/Users/bill/.openclaw/workspace/trading/trader-signals.md"
    "/Users/Shared/grocery-list.txt"
    "/Users/bill/.openclaw/workspace/trading/daily-opportunities/"
)

for file in "${test_files[@]}"; do
    if [ -e "$file" ]; then
        echo "✅ Found: $file"
    else
        echo "❌ Missing: $file"
    fi
done

echo ""
echo "3. Dashboard URL: http://localhost:8888"
echo "🎉 Mission Control v1 is ready!"