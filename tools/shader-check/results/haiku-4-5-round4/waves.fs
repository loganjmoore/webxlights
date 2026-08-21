/*{
  "DESCRIPTION": "Ocean waves rolling across the display with foam crests",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorDeep", "TYPE": "color", "DEFAULT": [0.0, 0.2, 0.6, 1.0] },
    { "NAME": "colorShallow", "TYPE": "color", "DEFAULT": [0.0, 0.8, 1.0, 1.0] },
    { "NAME": "colorFoam", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "waveScale", "TYPE": "float", "MIN": 0.5, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Determine if this is a thin vertical line or normal canvas
  float timeOffset = TIME * speed * 0.5;
  float waveY;
  
  if (RENDERSIZE.y < 2.0) {
    // Roofline: animate along x instead of y
    waveY = sin((uv.x - timeOffset) * waveScale * 6.28318) * 0.3 + 0.5;
  } else {
    // Normal canvas: waves roll across horizontally
    waveY = sin((uv.x - timeOffset) * waveScale * 6.28318) * 0.4 + 0.5;
  }
  
  // Calculate wave envelope - peak gets narrower
  float waveDistance = abs(uv.y - waveY);
  float wavePeak = smoothstep(0.15, 0.0, waveDistance);
  float waveBody = smoothstep(0.35, 0.0, waveDistance);
  
  // Foam appears at wave crests
  float foam = wavePeak * (0.5 + 0.5 * sin(uv.x * 12.0 + TIME * speed * 3.0));
  
  // Color based on depth: deep blue at bottom, shallow cyan higher up
  vec3 waterColor = mix(colorDeep.rgb, colorShallow.rgb, uv.y);
  
  // Blend wave brightness and foam
  vec3 finalColor = mix(waterColor, colorShallow.rgb, waveBody * 0.6);
  finalColor = mix(finalColor, colorFoam.rgb, foam * 0.8);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
