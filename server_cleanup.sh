lsof -i :8080 2>/dev/null | grep LISTEN || echo "Port 8080 not in use"

lsof -i :5173 2>/dev/null | grep LISTEN || echo "Port 5173 not in use"

pgrep -f "vite" 2>/dev/null && pkill -f "vite" && echo "Vite processes stopped" ||
      echo "No vite processes running"/
