# Tone Curve Visualizer

A toy photo editor for exploring the effects of standard photo editing controls.
This project provides both visual feedback through image preview and technical
insight through tone curve visualization.

## Features

### Image Adjustments
- **Basic Controls**
  - Exposure (-5 to +5)
  - Contrast (-100 to +100)
- **Tone Controls**
  - Highlights (-100 to +100)
  - Shadows (-100 to +100)
  - Whites (-100 to +100)
  - Blacks (-100 to +100)
- **Color Controls**
  - Temperature (-100 to +100)
  - Tint (-100 to +100)
  - Vibrance (-100 to +100)
  - Saturation (-100 to +100)

### Real-time Visualization
- Side-by-side comparison of original and processed images
- Dynamic tone curve display
- Interactive sliders with immediate feedback
- Drag-and-drop image loading

## Usage

1. Load an image by dragging and dropping into the "Original" area
2. Adjust sliders to modify the image
3. Observe changes in real-time
4. Monitor tone curve changes

## Technical Overview

Built with React and WebGL for efficient image processing. Uses GPU-accelerated
color space transformations and real-time tone curve visualization.

## Acknowlegements

Written by Claude Artifacts and Cursor. Supervised by
[@osteele](https://github.com/osteele).

The sample image is "Interior of the Library of Congress Reading Room,
Washington, D.C.", released to public domain [by Jean
Beaufort](https://www.publicdomainpictures.net/en/view-image.php?image=524147&picture=library-of-congress).

## License
This project is available under the MIT License.
