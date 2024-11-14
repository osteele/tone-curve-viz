export const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    gl_Position = vec4(a_position, 0, 1);
    v_texCoord = a_texCoord;
  }
`;

export const fragmentShaderSource = `
  // Request high precision if available, fallback to medium precision
  // High precision (fp32) needed for:
  // - pow(2.0, exposure) to handle small exposure adjustments accurately
  // - log() in temperature calculations
  // - color calculations in highlights where mediump (fp16) quantization is visible
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  varying vec2 v_texCoord;
  uniform sampler2D u_image;

  // Photo editing uniforms
  uniform float u_temperature; // 2000K to 12000K
  uniform float u_tint;       // -150 to +150
  uniform float u_exposure;   // -5 to +5
  uniform float u_highlights; // -100 to +100
  uniform float u_shadows;    // -100 to +100
  uniform float u_whites;     // -100 to +100
  uniform float u_blacks;     // -100 to +100
  uniform float u_contrast;   // 0 to 100
  uniform float u_vibrance;   // -100 to +100
  uniform float u_saturation; // -100 to +100

  // Convert temperature in Kelvin to RGB
  vec3 temperatureToRGB(float kelvin) {
    // Algorithm based on Tanner Helland's work
    float temp = kelvin / 100.0;
    vec3 color;

    if (temp <= 66.0) {
      color.r = 1.0;
      color.g = 0.39008157876901960784 * log(temp) - 0.63184144378862745098;
    } else {
      color.r = 1.29293618606274509804 * pow(temp - 60.0, -0.1332047592);
      color.g = 1.12989086089529411765 * pow(temp - 60.0, -0.0755148492);
    }

    if (temp >= 66.0) {
      color.b = 1.0;
    } else if (temp <= 19.0) {
      color.b = 0.0;
    } else {
      color.b = 0.54320678911019607843 * log(temp - 10.0) - 1.19625408914;
    }

    return clamp(color, 0.0, 1.0);
  }

  float hueToRgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
    if (t < 1.0/2.0) return q;
    if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
    return p;
  }

  vec3 hslToRgb(vec3 hsl) {
    vec3 rgb;

    if (hsl.y == 0.0) {
      rgb = vec3(hsl.z);
    } else {
      float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
      float p = 2.0 * hsl.z - q;

      rgb.r = hueToRgb(p, q, hsl.x + 1.0/3.0);
      rgb.g = hueToRgb(p, q, hsl.x);
      rgb.b = hueToRgb(p, q, hsl.x - 1.0/3.0);
    }

    return rgb;
  }

  vec3 rgbToHsl(vec3 rgb) {
    float maxVal = max(max(rgb.r, rgb.g), rgb.b);
    float minVal = min(min(rgb.r, rgb.g), rgb.b);
    float delta = maxVal - minVal;

    vec3 hsl = vec3(0.0, 0.0, (maxVal + minVal) / 2.0);

    if (delta != 0.0) {
      hsl.y = hsl.z < 0.5 ? delta / (maxVal + minVal) : delta / (2.0 - maxVal - minVal);

      if (maxVal == rgb.r) {
        hsl.x = (rgb.g - rgb.b) / delta + (rgb.g < rgb.b ? 6.0 : 0.0);
      } else if (maxVal == rgb.g) {
        hsl.x = (rgb.b - rgb.r) / delta + 2.0;
      } else {
        hsl.x = (rgb.r - rgb.g) / delta + 4.0;
      }
      hsl.x /= 6.0;
    }

    return hsl;
  }

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);
    vec3 rgb = color.rgb;

    // 1. White Balance
    float kelvin = u_temperature; // Already in Kelvin
    vec3 tempColor = temperatureToRGB(kelvin);
    rgb *= tempColor;
    rgb *= vec3(1.0 + u_tint * 0.01 * vec3(-1.0, 1.0, -1.0)); // Apply tint

    // 2. Exposure
    rgb *= pow(2.0, u_exposure);

    // 3. Highlights and Shadows
    float luminance = dot(rgb, vec3(0.299, 0.587, 0.114));
    float highlightsMask = smoothstep(0.5, 1.0, luminance);
    float shadowsMask = smoothstep(0.5, 0.0, luminance);

    rgb *= 1.0 + (u_highlights * 0.01 * highlightsMask);
    rgb *= 1.0 + (u_shadows * 0.01 * shadowsMask);

    // 4. Whites and Blacks
    float whitesMask = smoothstep(0.75, 1.0, luminance);
    float blacksMask = smoothstep(0.25, 0.0, luminance);

    rgb *= 1.0 + (u_whites * 0.01 * whitesMask);
    rgb *= 1.0 + (u_blacks * 0.01 * blacksMask);

    // 5. Contrast (fix the contrast calculation)
    float contrastFactor = (u_contrast - 50.0) / 50.0; // Now 50 maps to 0 (no change)
    rgb = (rgb - 0.5) * (contrastFactor + 1.0) + 0.5;

    // 6. Saturation and Vibrance
    vec3 hsl = rgbToHsl(rgb);
    hsl.y *= (1.0 + u_saturation * 0.01);

    // Vibrance (selective saturation)
    float satMask = 1.0 - hsl.y;
    hsl.y *= (1.0 + u_vibrance * 0.01 * satMask);

    rgb = hslToRgb(hsl);

    // Final clamping
    gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), color.a);
  }
`;
