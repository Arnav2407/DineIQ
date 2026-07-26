#!/bin/bash

# List of Python services
services=("reservation" "inventory" "sales" "feedback")

for service in "${services[@]}"; do
    req_file="./services/$service/requirements.txt"
    if [ -f "$req_file" ]; then
        echo "Updating $req_file"
        
        # Add missing packages if not already present
        if ! grep -q "PyJWT" "$req_file"; then
            echo "PyJWT>=2.8.0" >> "$req_file"
        fi
        if ! grep -q "email-validator" "$req_file"; then
            echo "email-validator>=2.0.0" >> "$req_file"
        fi
        if ! grep -q "pydantic\[email\]" "$req_file"; then
            echo "pydantic[email]>=2.0.0" >> "$req_file"
        fi
    else
        echo "Warning: $req_file not found"
    fi
done

echo "All requirements files updated!"
