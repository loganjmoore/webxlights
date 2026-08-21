/*{
  "DESCRIPTION": "Ocean waves rolling across the display with animated water motion",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorDeep", "TYPE": "color", "DEFAULT": [0.0, 0.2, 0.6, 1.0] },
    { "NAME": "colorShallow", "TYPE": "color", "DEFAULT": [0.0, 0.8, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "wavelength", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 1.0 },
    { "NAME": "waveHeight", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.4 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  float height = RENDERSIZE.y;
  
  // For very short displays (roof line), use horizontal wave instead of vertical
  float animCoord = (height < 2.0) ? uv.x : uv.y;
  
  // Create rolling wave using sine with horizontal scrolling
  float wave = sin((animCoord - TIME * speed * 0.5) * wavelength * 6.28318) * waveHeight;
  
  // Add secondary wave for texture
  float wave2 = sin((animCoord * 2.0 - TIME * speed * 0.3) * wavelength * 3.14159) * waveHeight * 0.5;
  
  // Combine waves
  float totalWave = wave + wave2;
  
  // Map wave position to color: deep at bottom, shallow at top
  float wavePos = (height < 2.0) ? (1.0 - uv.y) : uv.y;
  float blendFactor = smoothstep(-0.3, 0.7, wavePos + totalWave);
  
  vec3 waterColor = mix(colorDeep.rgb, colorShallow.rgb, blendFactor);
  
  gl_FragColor = vec4(waterColor, 1.0);
}
