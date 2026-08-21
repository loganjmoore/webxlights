/*{
  "DESCRIPTION": "A slow breathing glow that expands and contracts across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "glowColor", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "breathSpeed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "glowIntensity", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 center = vec2(0.5, 0.5);
  float dist = length(uv - center);
  
  float breathe = sin(TIME * breathSpeed * 0.5) * 0.5 + 0.5;
  float radiusMax = 1.2;
  float radius = mix(0.3, radiusMax, breathe);
  
  float softEdge = smoothstep(radius + 0.3, radius - 0.1, dist);
  float glow = softEdge * glowIntensity;
  
  vec3 color = glowColor.rgb * glow;
  gl_FragColor = vec4(color, 1.0);
}
