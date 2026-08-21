/*{
  "DESCRIPTION": "Two colour checkerboard sliding sideways",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 20.0, "DEFAULT": 4.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Apply scale to create checkerboard squares
  vec2 grid = floor(uv * scale);
  
  // Add horizontal sliding motion
  float offset = TIME * speed * 0.5;
  grid.x += floor(offset);
  
  // Determine checkerboard pattern: alternate based on sum of grid coordinates
  float pattern = mod(grid.x + grid.y, 2.0);
  
  // Mix between the two colours based on pattern
  vec3 finalColor = mix(colorA.rgb, colorB.rgb, pattern);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
