#!/bin/bash

echo "======================================================="
echo "  HEAD GAIT - Backend Setup"
echo "  HeadGait Integration for Real-time Gait Analysis"
echo "======================================================="
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Step 1: Create virtual environment
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
    if [ $? -eq 0 ]; then
        echo "✅ Virtual environment created"
    else
        echo "❌ Failed to create virtual environment"
        exit 1
    fi
else
    echo "✅ Virtual environment already exists"
fi

echo ""

# Step 2: Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

if [ $? -eq 0 ]; then
    echo "✅ Virtual environment activated"
else
    echo "❌ Failed to activate virtual environment"
    exit 1
fi

echo ""

# Step 3: Upgrade pip
echo "⬆️  Upgrading pip..."
pip install --upgrade pip --quiet

echo ""

# Step 4: Install Python dependencies
echo "📚 Installing Python dependencies..."
echo "   This may take a few minutes (TensorFlow is large)..."
pip install -r requirements.txt --quiet

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed"
else
    echo "⚠️  Some dependencies may have failed to install"
    echo "   Try running: source venv/bin/activate && pip install -r requirements.txt"
fi

echo ""

# Step 5: Clone HeadGait repository
if [ ! -d "headgait" ]; then
    echo "📥 Cloning HeadGait repository..."
    git clone https://github.com/H-MOVE-LAB/headgait.git --quiet
    
    if [ $? -eq 0 ]; then
        echo "✅ HeadGait repository cloned"
    else
        echo "❌ Failed to clone HeadGait repository"
        echo "   You can manually clone it: git clone https://github.com/H-MOVE-LAB/headgait.git"
    fi
else
    echo "✅ HeadGait repository already exists"
fi

echo ""
echo "======================================================="
echo "  ✅ Setup Complete!"
echo "======================================================="
echo ""
echo "📝 Next steps:"
echo ""
echo "1. Activate the virtual environment:"
echo "   source venv/bin/activate"
echo ""
echo "2. Start the WebSocket server:"
echo "   python server.py"
echo ""
echo "3. In your web app, click 'Start Real-time Analysis'"
echo ""
echo "📖 For more information, see README.md"
echo "======================================================="
