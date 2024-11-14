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
  precision mediump float;

  varying vec2 v_texCoord;
  uniform sampler2D u_image;

  // Photo editing uniforms
  uniform float u_exposure;
  uniform float u_contrast;
  uniform float u_highlights;
  uniform float u_shadows;
  uniform float u_whites;
  uniform float u_blacks;
  uniform float u_temperature;
  uniform float u_tint;
  uniform float u_vibrance;
  uniform float u_saturation;

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

  vec3 hslToRgb(vec3 hsl) {
    if (hsl.y == 0.0) {
      return vec3(hsl.z);
    }

    float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
    float p = 2.0 * hsl.z - q;

    vec3 rgb;
    float h = hsl.x;

    rgb.r = h + 1.0/3.0;
    rgb.g = h;
    rgb.b = h - 1.0/3.0;

    rgb = clamp(rgb, 0.0, 1.0);

    vec3 result;
    for(int i = 0; i < 3; i++) {
      if(rgb[i] < 1.0/6.0)
        result[i] = p + ((q - p) * 6.0 * rgb[i]);
      else if(rgb[i] < 1.0/2.0)
        result[i] = q;
      else if(rgb[i] < 2.0/3.0)
        result[i] = p + ((q - p) * 6.0 * (2.0/3.0 - rgb[i]));
      else
        result[i] = p;
    }

    return result;
  }

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);
    vec3 rgb = color.rgb;

    // Apply exposure
    rgb *= pow(2.0, u_exposure);

    // Apply contrast
    float contrast = u_contrast * 0.02;
    rgb = (rgb - 0.5) * (1.0 + contrast) + 0.5;

    // Convert to HSL for color adjustments
    vec3 hsl = rgbToHsl(rgb);

    // Apply temperature (blue-yellow balance)
    float tempShift = u_temperature * 0.01;
    hsl.x += tempShift * 0.05;

    // Apply tint (green-magenta balance)
    float tintShift = u_tint * 0.01;
    hsl.x += tintShift * 0.05;

    // Apply saturation
    hsl.y *= (1.0 + u_saturation * 0.01);

    // Convert back to RGB
    rgb = hslToRgb(hsl);

    // Apply shadows/highlights
    float luminance = dot(rgb, vec3(0.299, 0.587, 0.114));
    float shadowsAdjust = u_shadows * 0.01;
    float highlightsAdjust = u_highlights * 0.01;

    if (luminance < 0.5) {
      rgb *= 1.0 + shadowsAdjust * (0.5 - luminance);
    } else {
      rgb *= 1.0 + highlightsAdjust * (luminance - 0.5);
    }

    // Apply whites/blacks
    if (luminance < 0.25) {
      rgb *= 1.0 + u_blacks * 0.01 * (0.25 - luminance);
    } else if (luminance > 0.75) {
      rgb *= 1.0 + u_whites * 0.01 * (luminance - 0.75);
    }

    gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), color.a);
  }
`;
