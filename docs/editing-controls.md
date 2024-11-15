# Photo Editing Controls Technical Documentation

This document describes the technical implementation of photo editing controls in the WebGL-based photo editor.

## Overview

The photo editor implements real-time image adjustments using WebGL shaders. All adjustments are performed on the GPU, allowing for efficient processing of high-resolution images.

## Control Ranges and Order

The photo editor implements standard photo editing controls in the following order:

1. **White Balance**
   - Temperature: [2000K to 12000K], default 5500K
   - Tint: [-150 to +150], default 0

2. **Tone Controls**
   - Exposure: [-5.0 to +5.0] EV, default 0
   - Highlights: [-100 to +100], default 0
   - Shadows: [-100 to +100], default 0
   - Whites: [-100 to +100], default 0
   - Blacks: [-100 to +100], default 0

3. **Presence**
   - Contrast: [0 to +100], default 50
   - Saturation: [-100 to +100], default 0
   - Vibrance: [-100 to +100], default 0

## Processing Pipeline

### Order of Operations

1. **Raw Image Input**
   - Texture sampling: $color = texture2D(u_image, v_texCoord)$

2. **White Balance**
   - Temperature adjustment (Kelvin to RGB conversion)
   - Tint adjustment (green-magenta balance)

3. **Exposure**
   - $RGB_{out} = RGB_{in} \times 2^{exposure}$

4. **Highlights and Shadows Recovery**
   - Applied to preserve detail in extreme tonal ranges
   - Uses luminance-based masking

5. **Whites and Blacks**
   - Adjusts the white and black points
   - Applied before contrast to preserve detail

6. **Contrast**
   - Applied later to maintain proper tonal relationships
   - $RGB_{out} = (RGB_{in} - 0.5) \times (contrast + 1) + 0.5$

7. **Saturation and Vibrance**
   - Final color adjustments
   - Applied last to preserve color relationships

8. **Final Clamping**
   - $RGB_{final} = clamp(RGB, 0.0, 1.0)$

### Processing Order Rationale

1. **White Balance First**:
   - Corrects the overall color temperature before other adjustments
   - Simulates the physical process of light capture

2. **Exposure After White Balance**:
   - Adjusts the overall brightness while maintaining color relationships
   - Provides the foundation for subsequent tonal adjustments

3. **Tonal Range Adjustments**:
   - Highlights/Shadows recovery preserves detail in extreme ranges
   - Whites/Blacks fine-tune the tonal range endpoints
   - Applied before contrast to maintain detail

4. **Contrast After Tonal Range**:
   - Works with the properly distributed tonal range
   - Maintains the adjustments made by highlights/shadows

5. **Color Adjustments Last**:
   - Saturation and vibrance work on properly exposed image
   - Prevents unwanted color shifts from subsequent adjustments

## Technical Implementation Details

### Color Space Transformations

The shader performs color adjustments in both RGB and HSL color spaces. The conversion between RGB and HSL is implemented using the following algorithms:

#### RGB to HSL Conversion

The RGB to HSL conversion is performed using the following steps:

1. Find maximum and minimum RGB values:
   $$
   max = max(R, G, B)
   $$
   $$
   min = min(R, G, B)
   $$
   $$
   \Delta = max - min
   $$

2. Calculate Lightness:
   $$
   L = \frac{max + min}{2}
   $$

3. Calculate Saturation:
   $$
   S = \begin{cases}
   \frac{\Delta}{max + min} & \text{if } L < 0.5 \\
   \frac{\Delta}{2 - max - min} & \text{if } L \geq 0.5
   \end{cases}
   $$

4. Calculate Hue:
   $$
   H = \begin{cases}
   \frac{G - B}{\Delta} + 0 & \text{if } max = R \\
   \frac{B - R}{\Delta} + 2 & \text{if } max = G \\
   \frac{R - G}{\Delta} + 4 & \text{if } max = B
   \end{cases}
   $$
   $$
   H = \frac{H}{6}
   $$

### Performance Considerations

1. All adjustments are performed in a single shader pass to minimize GPU texture reads/writes
2. Uniform values are updated only when controls change
3. The preview curve is generated using a 256×1 pixel texture for efficiency

### Tone Curve Visualization

The tone curve visualization is generated by:
1. Creating a 256×1 gradient texture
2. Processing it through the same shader as the main image
3. Reading back the processed pixels
4. Plotting the resulting values using Recharts

## WebGL Context Management

The editor maintains three separate WebGL contexts:
- Original image preview
- Processed image preview
- Tone curve calculation

Each context is initialized with the same shader program but operates independently to prevent context conflicts.
