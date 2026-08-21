/*{
  "DESCRIPTION": "Two-color checkerboard pattern sliding horizontally",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 16.0, "DEFAULT": 4.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Scale the checkerboard and apply horizontal sliding
  vec2 grid = floor((uv * scale) + vec2(TIME * speed, 0.0));
  
  // Checkerboard pattern: alternate based on sum of grid coordinates
  float checker = mod(grid.x + grid.y, 2.0);
  
  // Mix colors based on checkerboard pattern
  vec3 color = mix(colorA.rgb, colorB.rgb, checker);
  
  gl_FragColor = vec4(color, 1.0);
}
