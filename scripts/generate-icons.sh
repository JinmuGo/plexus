#!/bin/bash

# Directory where icons are stored
ICON_DIR="src/resources/build/icons"
SOURCE_ICON="$ICON_DIR/icon.png"
ICONSET_DIR="$ICON_DIR/icon.iconset"

# Check if source icon exists
if [ ! -f "$SOURCE_ICON" ]; then
    echo "Error: Source icon $SOURCE_ICON not found!"
    exit 1
fi

echo "Creating iconset directory..."
mkdir -p "$ICONSET_DIR"

echo "Generating icons from $SOURCE_ICON..."

# Generate icons with sips
# Standard sizes
sips -z 16 16     "$SOURCE_ICON" --out "$ICONSET_DIR/icon_16x16.png"
sips -z 32 32     "$SOURCE_ICON" --out "$ICONSET_DIR/icon_16x16@2x.png"
sips -z 32 32     "$SOURCE_ICON" --out "$ICONSET_DIR/icon_32x32.png"
sips -z 64 64     "$SOURCE_ICON" --out "$ICONSET_DIR/icon_32x32@2x.png"
sips -z 128 128   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_128x128.png"
sips -z 256 256   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_128x128@2x.png"
sips -z 256 256   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_256x256.png"
sips -z 512 512   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_256x256@2x.png"
sips -z 512 512   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_512x512.png"

# Since source is 504x504, we can't truly make a higher res 1024x1024, 
# but we'll upscale it for the @2x slot if needed by the system, 
# though iconutil might complain or just accept it. 
# sips -z 1024 1024 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_512x512@2x.png"
# NOTE: Upscaling 504 to 1024 might look bad, but better to have the file than not if macOS demands it.
# Let's see if we can get away with just up to 512 for now since source is small.
# Actually, let's try to generate the 512@2x (1024) anyway so the set is complete.
sips -z 1024 1024 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_512x512@2x.png"


echo "Converting iconset to icns..."
iconutil -c icns "$ICONSET_DIR" -o "$ICON_DIR/icon.icns"

echo "Cleaning up..."
rm -rf "$ICONSET_DIR"

echo "Done! Generated $ICON_DIR/icon.icns"
