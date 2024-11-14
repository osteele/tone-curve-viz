# Developer Documentation

## Architecture
The application uses WebGL for efficient image processing:
- UI Components (React)
- WebGL Shaders for image processing
- WebGL-based tone curve calculation
- Color space transformations in shaders

## Key Components

### PhotoEditor
The main component that orchestrates:
- WebGL context and shader management
- Adjustment settings state
- Image loading and processing
- UI layout and interactions

### Image Processing Pipeline
1. WebGL texture creation from loaded images
2. GLSL shader-based processing:
   - Color space conversions (RGB ↔ HSL)
   - Exposure and contrast adjustments
   - Tone mapping (highlights, shadows, etc.)
   - Color temperature and tint
   - Vibrance and saturation

### Tone Curve Calculation
- Dynamic curve generation based on current settings
- Smooth interpolation between points
- Combined RGB curve visualization (displayed in gray)

## Color Space Handling
- RGB to HSL conversion for color adjustments
- HSL to RGB conversion for final output
- Proper handling of color ranges and boundaries

## Implementation Notes

### Performance Considerations
- Canvas-based processing with efficient buffer management
- Debounced updates for smooth interaction
- Interpolated curve application for accurate results

### Tone and Color Curve Visualization
- WebGL-based curve calculation using same shader as image processing
- Gradient preview showing actual output values
- Dynamic updates with adjustment changes
- Aligned visualization of curve and gradient

### WebGL Implementation
- Vertex and fragment shaders for image processing
- Efficient texture handling
- Framebuffer usage for curve calculation
- GPU-accelerated color space conversions

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
