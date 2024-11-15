import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { BookOpen, Info } from "lucide-react";
import React, { DragEvent, useCallback, useEffect, useState } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import "./PhotoEditor.css";
import {
  fragmentShaderSource,
  vertexShaderSource,
} from "./shaders/photo-editor";

interface PhotoSettings {
  temperature: number;
  tint: number;
  exposure: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  contrast: number;
  vibrance: number;
  saturation: number;
}

const DEFAULT_SETTINGS: PhotoSettings = {
  temperature: 5500,
  tint: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  contrast: 50,
  vibrance: 0,
  saturation: 0,
};

const LIGHT_CONTROLS: (keyof PhotoSettings)[] = [
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
];

const COLOR_CONTROLS: (keyof PhotoSettings)[] = [
  "temperature",
  "tint",
  "vibrance",
  "saturation",
];

interface CurvePoint {
  x: number;
  y: number;
}

// Create neutral settings for original image
const NEUTRAL_SETTINGS: PhotoSettings = {
  temperature: 5500, // Neutral daylight
  tint: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  contrast: 50, // Middle value
  vibrance: 0,
  saturation: 0,
};

interface Histogram {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  luminance: Uint32Array;
}

const calculateHistogram = (
  gl: WebGLRenderingContext,
  width: number,
  height: number
): Histogram => {
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  const r = new Uint32Array(256).fill(0);
  const g = new Uint32Array(256).fill(0);
  const b = new Uint32Array(256).fill(0);
  const luminance = new Uint32Array(256).fill(0);

  for (let i = 0; i < pixels.length; i += 4) {
    const rVal = pixels[i];
    const gVal = pixels[i + 1];
    const bVal = pixels[i + 2];

    r[rVal]++;
    g[gVal]++;
    b[bVal]++;

    // Calculate luminance using standard coefficients
    const lum = Math.round(0.2126 * rVal + 0.7152 * gVal + 0.0722 * bVal);
    luminance[lum]++;
  }

  return { r, g, b, luminance };
};

const calculateAutoSettings = (
  histogram: Histogram
): Partial<PhotoSettings> => {
  const totalPixels = histogram.luminance.reduce((a, b) => a + b, 0);

  // Gray World Assumption: calculate average RGB values
  const rAvg = histogram.r.reduce((a, b, i) => a + b * i, 0) / totalPixels;
  const gAvg = histogram.g.reduce((a, b, i) => a + b * i, 0) / totalPixels;
  const bAvg = histogram.b.reduce((a, b, i) => a + b * i, 0) / totalPixels;

  // Average of RGB channels should be middle gray (127.5)
  const avgBrightness = (rAvg + gAvg + bAvg) / 3;
  const exposureAdjustment = Math.log2(127.5 / avgBrightness);

  // Find black point (clip darkest 0.5% of pixels)
  let blackPoint = 0;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += histogram.luminance[i];
    if (sum > totalPixels * 0.005) {
      blackPoint = i;
      break;
    }
  }

  // Find white point (clip brightest 0.5% of pixels)
  let whitePoint = 255;
  sum = 0;
  for (let i = 255; i >= 0; i--) {
    sum += histogram.luminance[i];
    if (sum > totalPixels * 0.005) {
      whitePoint = i;
      break;
    }
  }

  // Calculate contrast based on histogram spread
  const histogramSpread = whitePoint - blackPoint;
  const contrastAdjustment = Math.min(
    100,
    Math.max(40, 50 + (histogramSpread / 255 - 0.5) * 50)
  );

  // Temperature adjustment based on red-blue balance
  const tempAdjustment = 5500 + (bAvg - rAvg) * 25;

  return {
    exposure: Math.max(-2, Math.min(2, exposureAdjustment)),
    contrast: contrastAdjustment,
    temperature: Math.min(12000, Math.max(2000, tempAdjustment)),
    blacks: Math.max(-50, blackPoint / 2), // More aggressive blacks adjustment
    whites: Math.min(50, (255 - whitePoint) / 2),
    highlights: 0,
    shadows: 0,
    tint: 0,
    vibrance: 0,
    saturation: 0,
  };
};

const checkHighPrecisionSupport = (gl: WebGLRenderingContext): boolean => {
  const precisionFormat = gl.getShaderPrecisionFormat(
    gl.FRAGMENT_SHADER,
    gl.HIGH_FLOAT
  );
  return precisionFormat !== null && precisionFormat.precision > 0;
};

const PhotoEditor: React.FC = () => {
  const [settings, setSettings] = useState<PhotoSettings>(DEFAULT_SETTINGS);
  const [originalImageUrl, setOriginalImageUrl] =
    useState<string>("/image.jpg");
  const [processedGl, setProcessedGl] = useState<WebGLRenderingContext | null>(
    null
  );
  const [processedProgram, setProcessedProgram] = useState<WebGLProgram | null>(
    null
  );
  const [processedTexture, setProcessedTexture] = useState<WebGLTexture | null>(
    null
  );
  const [curveData, setCurveData] = useState<CurvePoint[]>([]);
  const [curveGl, setCurveGl] = useState<WebGLRenderingContext | null>(null);
  const [curveProgram, setCurveProgram] = useState<WebGLProgram | null>(null);
  const [curveTexture, setCurveTexture] = useState<WebGLTexture | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const renderImage = (
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    texture: WebGLTexture,
    settings: PhotoSettings
  ) => {
    gl.useProgram(program);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const textureLocation = gl.getUniformLocation(program, "u_image");
    if (textureLocation === null) return;
    gl.uniform1i(textureLocation, 0);

    // Map settings to uniforms
    const uniforms = {
      u_temperature: settings.temperature,
      u_tint: settings.tint,
      u_exposure: settings.exposure,
      u_highlights: settings.highlights,
      u_shadows: settings.shadows,
      u_whites: settings.whites,
      u_blacks: settings.blacks,
      u_contrast: settings.contrast,
      u_vibrance: settings.vibrance,
      u_saturation: settings.saturation,
    };

    Object.entries(uniforms).forEach(([name, value]) => {
      const location = gl.getUniformLocation(program, name);
      if (location === null) return;
      gl.uniform1f(location, value);
    });

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  // Calculate tone curves based on current settings
  const calculateToneCurves = useCallback(() => {
    if (!curveGl || !curveProgram || !curveTexture) return;

    // Create and bind framebuffer
    const framebuffer = curveGl.createFramebuffer();
    const outputTexture = curveGl.createTexture();

    curveGl.bindFramebuffer(curveGl.FRAMEBUFFER, framebuffer);
    curveGl.bindTexture(curveGl.TEXTURE_2D, outputTexture);

    // Create texture for rendering
    curveGl.texImage2D(
      curveGl.TEXTURE_2D,
      0,
      curveGl.RGBA,
      256,
      1,
      0,
      curveGl.RGBA,
      curveGl.UNSIGNED_BYTE,
      null
    );

    // Attach texture to framebuffer
    curveGl.framebufferTexture2D(
      curveGl.FRAMEBUFFER,
      curveGl.COLOR_ATTACHMENT0,
      curveGl.TEXTURE_2D,
      outputTexture,
      0
    );

    // Render gradient with current settings
    renderImage(curveGl, curveProgram, curveTexture, settings);

    // Read back the processed pixels
    const pixels = new Uint8Array(256 * 4);
    curveGl.readPixels(
      0,
      0,
      256,
      1,
      curveGl.RGBA,
      curveGl.UNSIGNED_BYTE,
      pixels
    );

    // Create curve points from the processed pixels, ensuring full range
    const points: CurvePoint[] = Array.from({ length: 256 }, (_, i) => ({
      x: i,
      y: Math.min(255, Math.max(0, pixels[i * 4])), // Clamp values between 0-255
    }));

    setCurveData(points);

    // Cleanup
    curveGl.deleteFramebuffer(framebuffer);
    curveGl.deleteTexture(outputTexture);
    curveGl.bindFramebuffer(curveGl.FRAMEBUFFER, null);
  }, [curveGl, curveProgram, curveTexture, settings]);

  useEffect(() => {
    calculateToneCurves();
  }, [settings, calculateToneCurves]);

  // Initialize WebGL context and program
  const initWebGL = useCallback(
    (canvas: HTMLCanvasElement, gl: WebGLRenderingContext) => {
      // Check precision support
      const hasHighP = checkHighPrecisionSupport(gl);
      if (!hasHighP) {
        console.warn(
          "High precision float not supported - image quality may be reduced"
        );
      }

      // Create shader program
      const vertexShader = gl.createShader(gl.VERTEX_SHADER);
      if (!vertexShader) {
        console.error("Failed to create vertex shader");
        return;
      }
      gl.shaderSource(vertexShader, vertexShaderSource);
      gl.compileShader(vertexShader);

      // Check vertex shader compilation
      if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        console.error(
          "Vertex shader compilation error:",
          gl.getShaderInfoLog(vertexShader)
        );
        return;
      }

      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      if (!fragmentShader) {
        console.error("Failed to create fragment shader");
        return;
      }
      gl.shaderSource(fragmentShader, fragmentShaderSource);
      gl.compileShader(fragmentShader);

      // Check fragment shader compilation
      if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        console.error(
          "Fragment shader compilation error:",
          gl.getShaderInfoLog(fragmentShader)
        );
        return;
      }

      const prog = gl.createProgram();
      if (!prog) return;

      gl.attachShader(prog, vertexShader);
      gl.attachShader(prog, fragmentShader);
      gl.linkProgram(prog);

      // Check program linking
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error("Program linking error:", gl.getProgramInfoLog(prog));
        return;
      }

      // Get attribute locations
      const positionLocation = gl.getAttribLocation(prog, "a_position");
      const texCoordLocation = gl.getAttribLocation(prog, "a_texCoord");

      // Set up buffers
      const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
      const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);

      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

      const texCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

      // Set up the attributes
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      gl.enableVertexAttribArray(texCoordLocation);
      gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

      return prog;
    },
    []
  );

  const loadImage = useCallback(
    (source: File | string) => {
      if (!processedGl || !processedProgram) return;

      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        // Set the image URL for the original image
        if (source instanceof File) {
          const url = URL.createObjectURL(source);
          setOriginalImageUrl(url);
        } else {
          setOriginalImageUrl(source);
        }

        // Set up processed image texture
        const canvas = processedGl.canvas as HTMLCanvasElement;
        canvas.width = img.width;
        canvas.height = img.height;
        processedGl.viewport(0, 0, img.width, img.height);

        const processedTex = processedGl.createTexture();
        if (!processedTex) return;

        processedGl.bindTexture(processedGl.TEXTURE_2D, processedTex);
        processedGl.texImage2D(
          processedGl.TEXTURE_2D,
          0,
          processedGl.RGBA,
          processedGl.RGBA,
          processedGl.UNSIGNED_BYTE,
          img
        );

        processedGl.texParameteri(
          processedGl.TEXTURE_2D,
          processedGl.TEXTURE_WRAP_S,
          processedGl.CLAMP_TO_EDGE
        );
        processedGl.texParameteri(
          processedGl.TEXTURE_2D,
          processedGl.TEXTURE_WRAP_T,
          processedGl.CLAMP_TO_EDGE
        );
        processedGl.texParameteri(
          processedGl.TEXTURE_2D,
          processedGl.TEXTURE_MIN_FILTER,
          processedGl.LINEAR
        );
        processedGl.texParameteri(
          processedGl.TEXTURE_2D,
          processedGl.TEXTURE_MAG_FILTER,
          processedGl.LINEAR
        );

        setProcessedTexture(processedTex);
      };

      if (source instanceof File) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (!e.target?.result) return;
          img.src = e.target.result as string;
        };
        reader.readAsDataURL(source);
      } else {
        img.src = source;
      }
    },
    [processedGl, processedProgram]
  );

  useEffect(() => {
    if (processedGl && processedProgram) {
      // Only load when GL is ready
      loadImage("/image.jpg");
    }
  }, [loadImage, processedGl, processedProgram]);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        loadImage(file);
      }
    },
    [loadImage]
  );

  // Render the processed image
  useEffect(() => {
    if (!processedGl || !processedTexture || !processedProgram) return;

    // Render processed image with current settings
    renderImage(processedGl, processedProgram, processedTexture, settings);
  }, [processedGl, processedTexture, processedProgram, settings]);

  const renderSlider = (name: keyof PhotoSettings) => {
    const ranges = {
      temperature: { min: 2000, max: 12000, step: 100, default: 5500 },
      tint: { min: -150, max: 150, step: 1, default: 0 },
      exposure: { min: -5, max: 5, step: 0.1, default: 0 },
      highlights: { min: -100, max: 100, step: 1, default: 0 },
      shadows: { min: -100, max: 100, step: 1, default: 0 },
      whites: { min: -100, max: 100, step: 1, default: 0 },
      blacks: { min: -100, max: 100, step: 1, default: 0 },
      contrast: { min: 0, max: 100, step: 1, default: 50 },
      vibrance: { min: -100, max: 100, step: 1, default: 0 },
      saturation: { min: -100, max: 100, step: 1, default: 0 },
    };

    const range = ranges[name];

    const handleValueChange = (value: number[]) => {
      setSettings((prev) => ({
        ...prev,
        [name]: value[0],
      }));
    };

    return (
      <div className="mb-2">
        <label className="block text-sm font-medium mb-1">
          {name.charAt(0).toUpperCase() + name.slice(1)}
        </label>
        <Slider
          value={[settings[name]]}
          min={range.min}
          max={range.max}
          step={range.step}
          onValueChange={handleValueChange}
          className="w-full mb-1.5"
        />
        <span className="text-sm">
          {name === "temperature" ? `${settings[name]}K` : settings[name]}
        </span>
      </div>
    );
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  const createGradientPixmap = () => {
    const width = 256;
    const height = 1;
    const data = new Uint8ClampedArray(width * height * 4);

    // Create a gradient from 0 to 255
    for (let x = 0; x < width; x++) {
      const i = x * 4;
      data[i] = x; // R
      data[i + 1] = x; // G
      data[i + 2] = x; // B
      data[i + 3] = 255; // A
    }

    return new ImageData(data, width, height);
  };

  useEffect(() => {
    // Initialize curve WebGL context
    const curveCanvas = document.createElement("canvas");
    curveCanvas.width = 256;
    curveCanvas.height = 1;

    const gl = curveCanvas.getContext("webgl");
    if (!gl) return;

    // Create and initialize program
    const prog = initWebGL(curveCanvas, gl);
    if (!prog) return;

    // Create gradient texture
    const gradientData = createGradientPixmap();
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      gradientData
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    setCurveGl(gl);
    setCurveProgram(prog);
    setCurveTexture(tex);

    return () => {
      // Cleanup
      if (tex) gl.deleteTexture(tex);
      if (prog) gl.deleteProgram(prog);
    };
  }, []); // Run once on mount

  const GradientPreview: React.FC<{ data: CurvePoint[] }> = ({ data }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    React.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !data.length) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw the gradient using the curve data
      const imageData = ctx.createImageData(256, 1);
      data.forEach((point, i) => {
        const idx = i * 4;
        imageData.data[idx] = point.y; // R
        imageData.data[idx + 1] = point.y; // G
        imageData.data[idx + 2] = point.y; // B
        imageData.data[idx + 3] = 255; // A
      });

      ctx.putImageData(imageData, 0, 0);
    }, [data]);

    return (
      <canvas
        ref={canvasRef}
        width={256}
        height={1}
        className="gradient-preview"
      />
    );
  };

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleAutoAdjust = useCallback(() => {
    if (!processedGl || !processedTexture) return;

    const canvas = processedGl.canvas as HTMLCanvasElement;
    const histogram = calculateHistogram(
      processedGl,
      canvas.width,
      canvas.height
    );
    const autoSettings = calculateAutoSettings(histogram);

    setSettings((prev) => ({
      ...prev,
      ...autoSettings,
    }));
  }, [processedGl, processedTexture]);

  const drawHistogram = useCallback(
    (canvas: HTMLCanvasElement, histogram: Histogram) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set canvas size with device pixel ratio for sharp rendering
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, rect.width, rect.height);

      // Find the maximum value for scaling
      const maxCount = Math.max(...histogram.luminance);

      // Draw RGB histograms with low opacity
      const channels = [
        { data: histogram.r, color: "rgba(255, 50, 50, 0.3)" },
        { data: histogram.g, color: "rgba(50, 255, 50, 0.3)" },
        { data: histogram.b, color: "rgba(50, 50, 255, 0.3)" },
      ];

      channels.forEach(({ data, color }) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;

        for (let i = 0; i < 256; i++) {
          const x = (i / 255) * rect.width;
          const h = (data[i] / maxCount) * rect.height;

          if (i === 0) {
            ctx.moveTo(x, rect.height);
          }
          ctx.lineTo(x, rect.height - h);
        }

        ctx.stroke();
      });

      // Draw luminance histogram on top
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 1;

      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * rect.width;
        const h = (histogram.luminance[i] / maxCount) * rect.height;

        if (i === 0) {
          ctx.moveTo(x, rect.height);
        }
        ctx.lineTo(x, rect.height - h);
      }

      ctx.stroke();
    },
    []
  );

  useEffect(() => {
    if (!processedGl || !processedProgram || !processedTexture) return;

    const originalHistogramCanvas = document.querySelector(
      ".original-histogram"
    ) as HTMLCanvasElement;
    const processedHistogramCanvas = document.querySelector(
      ".processed-histogram"
    ) as HTMLCanvasElement;

    if (originalHistogramCanvas && processedHistogramCanvas) {
      // For original image, use neutral settings and only update once
      renderImage(
        processedGl,
        processedProgram,
        processedTexture,
        NEUTRAL_SETTINGS
      );
      const originalHistogram = calculateHistogram(
        processedGl,
        processedGl.canvas.width,
        processedGl.canvas.height
      );
      drawHistogram(originalHistogramCanvas, originalHistogram);

      // For processed image, use current settings and update with changes
      renderImage(processedGl, processedProgram, processedTexture, settings);
      const processedHistogram = calculateHistogram(
        processedGl,
        processedGl.canvas.width,
        processedGl.canvas.height
      );
      drawHistogram(processedHistogramCanvas, processedHistogram);

      // Render the processed image again to ensure it's displayed
      renderImage(processedGl, processedProgram, processedTexture, settings);
    }
  }, [
    processedGl,
    processedProgram,
    processedTexture,
    settings,
    drawHistogram,
  ]);

  return (
    <>
      <div className="flex gap-4 p-4 min-h-[calc(100vh-2rem)]">
        <div className="flex flex-col gap-4 flex-[2]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Tone Curve Visualizer</h2>
            <a
              href="https://github.com/osteele/tone-curve-viz#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded-full hover:bg-secondary/80 transition-colors"
              title="View documentation"
            >
              <Info className="w-4 h-4" />
            </a>
          </div>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold">Image</h2>
              </div>
              <div className="flex gap-4">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative flex-1 ${
                    isDragging ? "bg-secondary/50" : ""
                  }`}
                >
                  <h3 className="text-sm mb-2">Original (Drop image here)</h3>
                  <img
                    src={originalImageUrl}
                    alt="Original"
                    className="w-full h-auto"
                    crossOrigin="anonymous"
                  />
                  <canvas className="histogram-canvas original-histogram" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm mb-2">Processed</h3>
                  <canvas
                    ref={(canvas) => {
                      if (canvas && !processedGl) {
                        const gl = canvas.getContext("webgl");
                        if (gl) {
                          const program = initWebGL(canvas, gl);
                          if (program) {
                            setProcessedGl(gl);
                            setProcessedProgram(program);
                          }
                        }
                      }
                    }}
                    className="w-full h-auto"
                  />
                  <canvas className="histogram-canvas processed-histogram" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h2 className="text-lg font-semibold mb-4">Tone Curve</h2>
              <div className="relative pb-12">
                <LineChart width={400} height={200} data={curveData}>
                  <XAxis dataKey="x" domain={[0, 255]} />{" "}
                  {/* Ensure full range */}
                  <YAxis domain={[0, 255]} /> {/* Ensure full range */}
                  <Line
                    type="monotone"
                    dataKey="y"
                    stroke="#666"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
                <GradientPreview data={curveData} />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="flex-1">
          <CardContent className="p-4 h-[calc(100vh-2rem)] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Controls</h2>
              <div className="flex gap-2 items-center">
                <Button
                  onClick={handleAutoAdjust}
                  className="px-3 py-1 text-sm"
                  variant="secondary"
                >
                  Auto
                </Button>
                <Button
                  onClick={handleReset}
                  className="px-3 py-1 text-sm"
                  variant="secondary"
                >
                  Reset
                </Button>
                <a
                  href="https://github.com/osteele/tone-curve-viz/blob/main/docs/editing-controls.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-full hover:bg-secondary/80 transition-colors"
                  title="View editing controls documentation"
                >
                  <BookOpen className="w-4 h-4" />
                </a>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              <div className="mb-4 light-controls">
                <h3 className="section-title">Light</h3>
                {LIGHT_CONTROLS.map((name) => (
                  <div key={`light-${name}`}>{renderSlider(name)}</div>
                ))}
              </div>

              <div className="mb-4 color-controls">
                <h3 className="section-title">Color</h3>
                {COLOR_CONTROLS.map((name) => (
                  <div key={`color-${name}`}>{renderSlider(name)}</div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <footer className="fixed bottom-0 left-0 right-0 p-2 text-center text-sm bg-background/80 backdrop-blur-sm border-t flex items-center justify-center gap-2">
        <a
          href="https://github.com/osteele/tone-curve-viz"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary"
          title="View source code"
        >
          <svg height="16" viewBox="0 0 16 16" width="16">
            <path
              fillRule="evenodd"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              fill="currentColor"
            />
          </svg>
        </a>
        <span>
          Copyright 2024 by{" "}
          <a
            href="https://github.com/osteele"
            className="text-primary hover:underline"
          >
            Oliver Steele
          </a>
          .
        </span>
        <span>This site is under</span>
        <span>
          <a
            href="https://underconstruction.fun"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Under Construction
          </a>
          .
        </span>
      </footer>
    </>
  );
};

export default PhotoEditor;
