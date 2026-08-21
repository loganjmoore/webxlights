/*{
  "DESCRIPTION": "Slow-moving lava lamp blobs that rise and fall with organic motion",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 3.0, "DEFAULT": 1.5 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Handle tall vs short displays
  float animCoord = uv.x;
  if (RENDERSIZE.y < 2.0) {
    animCoord = uv.x;
  } else {
    animCoord = uv.y;
  }
  
  // Create multiple overlapping blob positions
  float blob1 = sin(TIME * speed * 0.3 + uv.x * 3.0) * 0.5 + 0.5;
  float blob2 = sin(TIME * speed * 0.25 - uv.x * 2.5 + 2.0) * 0.5 + 0.5;
  float blob3 = sin(TIME * speed * 0.35 + uv.x * 2.0 + 4.0) * 0.5 + 0.5;
  
  // Distance to blob centers
  float dist1 = abs(animCoord - blob1);
  float dist2 = abs(animCoord - blob2);
  float dist3 = abs(animCoord - blob3);
  
  // Smooth blob shapes with organic falloff
  float radius = 0.15 / scale;
  float blob = smoothstep(radius + 0.05, radius - 0.05, dist1)
             + smoothstep(radius + 0.08, radius - 0.08, dist2) * 0.7
             + smoothstep(radius + 0.06, radius - 0.06, dist3) * 0.6;
  
  blob = clamp(blob, 0.0, 1.0);
  
  // Color based on position and blob intensity
  float colorMix = fract(animCoord * 2.0 + TIME * speed * 0.1);
  vec3 color = mix(colorA.rgb, colorB.rgb, colorMix);
  
  // Blend with black background
  vec3 finalColor = mix(vec3(0.0), color, blob);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
