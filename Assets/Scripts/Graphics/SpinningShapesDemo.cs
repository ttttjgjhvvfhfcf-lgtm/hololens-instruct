using UnityEngine;

namespace HololensInstruct.Graphics
{
    // Simple 3D graphics demo: spawns a row of rotating primitives in front of the user.
    // Pure UnityEngine, no MRTK dependency - attach to any empty GameObject in the scene.
    public class SpinningShapesDemo : MonoBehaviour
    {
        [SerializeField] private float distanceFromCamera = 2f;
        [SerializeField] private float shapeSpacing = 0.3f;
        [SerializeField] private float shapeScale = 0.15f;
        [SerializeField] private float rotationSpeedDegreesPerSecond = 60f;

        private static readonly PrimitiveType[] ShapeTypes =
        {
            PrimitiveType.Cube,
            PrimitiveType.Sphere,
            PrimitiveType.Cylinder,
        };

        private static readonly Color[] ShapeColors =
        {
            Color.red,
            Color.cyan,
            Color.yellow,
        };

        private Transform[] shapes;

        private void Start()
        {
            Transform origin = Camera.main != null ? Camera.main.transform : transform;
            Vector3 center = origin.position + origin.forward * distanceFromCamera;

            shapes = new Transform[ShapeTypes.Length];

            for (int i = 0; i < ShapeTypes.Length; i++)
            {
                GameObject shape = GameObject.CreatePrimitive(ShapeTypes[i]);
                shape.name = $"DemoShape_{ShapeTypes[i]}";
                shape.transform.SetParent(transform, worldPositionStays: false);

                float offset = (i - (ShapeTypes.Length - 1) / 2f) * shapeSpacing;
                shape.transform.position = center + origin.right * offset;
                shape.transform.localScale = Vector3.one * shapeScale;
                shape.GetComponent<Renderer>().material.color = ShapeColors[i];

                shapes[i] = shape.transform;
            }
        }

        private void Update()
        {
            if (shapes == null)
            {
                return;
            }

            float step = rotationSpeedDegreesPerSecond * Time.deltaTime;
            foreach (Transform shape in shapes)
            {
                shape.Rotate(Vector3.up, step, Space.World);
            }
        }
    }
}
