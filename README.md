# Tone Curve Visualization

A toy photo editor for exploring the effects of standard photo editing controls.
This project provides both visual feedback through image preview and technical
insight through tone curve visualization, using WebGL for efficient image
processing.

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

## Technical Details

### Architecture
The application uses WebGL for efficient image processing:
- UI Components (React)
- WebGL Shaders for image processing
- WebGL-based tone curve calculation
- Color space transformations in shaders

### Key Components

#### PhotoEditor
The main component that orchestrates:
- WebGL context and shader management
- Adjustment settings state
- Image loading and processing
- UI layout and interactions

#### Image Processing Pipeline
1. WebGL texture creation from loaded images
2. GLSL shader-based processing:
   - Color space conversions (RGB ↔ HSL)
   - Exposure and contrast adjustments
   - Tone mapping (highlights, shadows, etc.)
   - Color temperature and tint
   - Vibrance and saturation

#### Tone Curve Calculation
- Dynamic curve generation based on current settings
- Smooth interpolation between points
- Combined RGB curve visualization (displayed in gray)

### Color Space Handling
- RGB to HSL conversion for color adjustments
- HSL to RGB conversion for final output
- Proper handling of color ranges and boundaries

## Implementation Notes

### Performance Considerations
- Canvas-based processing with efficient buffer management
- Debounced updates for smooth interaction
- Interpolated curve application for accurate results

#### Tone and Color Curve Visualization
- WebGL-based curve calculation using same shader as image processing
- Gradient preview showing actual output values
- Dynamic updates with adjustment changes
- Aligned visualization of curve and gradient

### WebGL Implementation
- Vertex and fragment shaders for image processing
- Efficient texture handling
- Framebuffer usage for curve calculation
- GPU-accelerated color space conversions

## Usage

### Basic Usage
1. Load an image by dragging and dropping into the "Original" area
2. Adjust sliders to modify the image
3. Observe changes in real-time
4. Monitor tone curve changes

### Advanced Features
- Combined adjustment stacking
- Non-destructive editing
- Real-time preview updates

## Development

### Setup
1. Clone the repository
2. Install dependencies
3. Start the development server

### Required Dependencies
- React
- Recharts (for curve visualization)
- Tailwind CSS (for styling)
- shadcn/ui components

### Contributing
Contributions are welcome! Please follow these steps:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## Acknowlegements

Written by Claude Artifacts and Cursor. Supervised by
[@osteele](https://github.com/osteele).

## License
This project is available under the MIT License.
