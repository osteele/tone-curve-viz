import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
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
  "highlights",
  "shadows",
  "whites",
  "blacks",
];

const COLOR_CONTROLS: (keyof PhotoSettings)[] = [
  "temperature",
  "tint",
  "contrast",
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

  // Add helper function for rendering
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

    // Create curve points from the processed pixels
    const points: CurvePoint[] = Array.from({ length: 256 }, (_, i) => ({
      x: i,
      y: pixels[i * 4], // Using red channel
    }));

    setCurveData(points);

    // Cleanup
    curveGl.deleteFramebuffer(framebuffer);
    curveGl.deleteTexture(outputTexture);
    curveGl.bindFramebuffer(curveGl.FRAMEBUFFER, null);
  }, [curveGl, curveProgram, curveTexture, settings]);

  // Add effect to update curve data when settings change
  useEffect(() => {
    calculateToneCurves();
  }, [settings, calculateToneCurves]);

  // Initialize WebGL context and program
  const initWebGL = useCallback(
    (canvas: HTMLCanvasElement, gl: WebGLRenderingContext) => {
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
  ); // Remove processedGl from dependencies

  // Modify the loadImage function to handle both File and string URLs
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

  // Update the useEffect for loading the default image
  useEffect(() => {
    if (processedGl && processedProgram) {
      // Only load when GL is ready
      loadImage("/image.jpg");
    }
  }, [loadImage, processedGl, processedProgram]);

  // Update the handleDrop callback to use the modified loadImage function
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
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          {name.charAt(0).toUpperCase() + name.slice(1)}
        </label>
        <Slider
          value={[settings[name]]}
          min={range.min}
          max={range.max}
          step={range.step}
          onValueChange={handleValueChange}
          className="w-full"
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

  // Add this function at the top of the component
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

  // Add this effect after the other useEffects
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

  // Update the GradientPreview component
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

  // Add these handlers near the other event handlers
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div className="flex gap-4 p-4">
      <div className="flex flex-col gap-4 flex-[2]">
        <Card>
          <CardContent className="p-4">
            <h2 className="text-lg font-semibold mb-4">Preview</h2>
            <div className="flex gap-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative ${isDragging ? "bg-secondary/50" : ""}`}
              >
                <h3 className="text-sm mb-2">Original (Drop image here)</h3>
                <img
                  src={originalImageUrl}
                  alt="Original"
                  className="w-full h-auto"
                  crossOrigin="anonymous"
                />
                {isDragging && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 border-2 border-dashed border-primary rounded-lg">
                    <span className="text-sm">Drop image here</span>
                  </div>
                )}
              </div>
              <div>
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
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h2 className="text-lg font-semibold mb-4">Tone Curves</h2>
            <div className="relative pb-12">
              <LineChart width={400} height={400} data={curveData}>
                <XAxis dataKey="x" />
                <YAxis />
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
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Controls</h2>
            <button
              onClick={handleReset}
              className="px-3 py-1 text-sm bg-secondary hover:bg-secondary/80 rounded-md"
            >
              Reset All
            </button>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-semibold mb-4 border-b pb-2">Light</h3>
            {LIGHT_CONTROLS.map((name) => (
              <div key={`light-${name}`}>{renderSlider(name)}</div>
            ))}
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-semibold mb-4 border-b pb-2">Color</h3>
            {COLOR_CONTROLS.map((name) => (
              <div key={`color-${name}`}>{renderSlider(name)}</div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PhotoEditor;
